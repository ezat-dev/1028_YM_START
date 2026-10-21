-- MariaDB 기준. db_ym_pro 스키마에 실행.
-- 사용자관리 / 사용자권한 / 로그인이력 3개 메뉴가 실제로 사용하는 테이블.
-- (나머지 메뉴는 아직 1단계 골격이라 테이블이 없어도 목록 조회 API가 빈 값을 반환)

CREATE DATABASE IF NOT EXISTS db_ym_pro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE db_ym_pro;

CREATE TABLE IF NOT EXISTS base_user (
    user_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    login_id    VARCHAR(50)  NOT NULL,
    password    VARCHAR(255) NOT NULL,
    user_name   VARCHAR(50)  NOT NULL,
    dept_name   VARCHAR(50)  NULL,
    phone       VARCHAR(20)  NULL,
    email       VARCHAR(100) NULL,
    use_yn      CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_user_login_id (login_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS base_auth (
    auth_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    menu_path   VARCHAR(100) NOT NULL,
    can_create  TINYINT(1) NOT NULL DEFAULT 0,
    can_read    TINYINT(1) NOT NULL DEFAULT 0,
    can_update  TINYINT(1) NOT NULL DEFAULT 0,
    can_delete  TINYINT(1) NOT NULL DEFAULT 0,
    reg_dt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_auth_user_menu (user_id, menu_path),
    CONSTRAINT fk_base_auth_user FOREIGN KEY (user_id) REFERENCES base_user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS base_login_hist (
    history_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
    login_id     VARCHAR(50) NOT NULL,
    user_name    VARCHAR(50) NULL,
    login_ip     VARCHAR(50) NULL,
    success_yn   CHAR(1) NOT NULL,
    fail_reason  VARCHAR(200) NULL,
    login_dt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 조건관리 > 일상점검일지: 고정 점검 항목(행) × 1~31일(열) 월별 체크리스트.
CREATE TABLE IF NOT EXISTS condition_daily_check (
    cnt         INT AUTO_INCREMENT PRIMARY KEY,
    d_title     VARCHAR(50)  NOT NULL DEFAULT '',
    d_desc      VARCHAR(255) NOT NULL DEFAULT '',
    d_ym        VARCHAR(10)  NOT NULL DEFAULT '',
    img_url     VARCHAR(255) NOT NULL DEFAULT '',
    d01 VARCHAR(10) NOT NULL DEFAULT '', d02 VARCHAR(10) NOT NULL DEFAULT '', d03 VARCHAR(10) NOT NULL DEFAULT '',
    d04 VARCHAR(10) NOT NULL DEFAULT '', d05 VARCHAR(10) NOT NULL DEFAULT '', d06 VARCHAR(10) NOT NULL DEFAULT '',
    d07 VARCHAR(10) NOT NULL DEFAULT '', d08 VARCHAR(10) NOT NULL DEFAULT '', d09 VARCHAR(10) NOT NULL DEFAULT '',
    d10 VARCHAR(10) NOT NULL DEFAULT '', d11 VARCHAR(10) NOT NULL DEFAULT '', d12 VARCHAR(10) NOT NULL DEFAULT '',
    d13 VARCHAR(10) NOT NULL DEFAULT '', d14 VARCHAR(10) NOT NULL DEFAULT '', d15 VARCHAR(10) NOT NULL DEFAULT '',
    d16 VARCHAR(10) NOT NULL DEFAULT '', d17 VARCHAR(10) NOT NULL DEFAULT '', d18 VARCHAR(10) NOT NULL DEFAULT '',
    d19 VARCHAR(10) NOT NULL DEFAULT '', d20 VARCHAR(10) NOT NULL DEFAULT '', d21 VARCHAR(10) NOT NULL DEFAULT '',
    d22 VARCHAR(10) NOT NULL DEFAULT '', d23 VARCHAR(10) NOT NULL DEFAULT '', d24 VARCHAR(10) NOT NULL DEFAULT '',
    d25 VARCHAR(10) NOT NULL DEFAULT '', d26 VARCHAR(10) NOT NULL DEFAULT '', d27 VARCHAR(10) NOT NULL DEFAULT '',
    d28 VARCHAR(10) NOT NULL DEFAULT '', d29 VARCHAR(10) NOT NULL DEFAULT '', d30 VARCHAR(10) NOT NULL DEFAULT '',
    d31 VARCHAR(10) NOT NULL DEFAULT '',
    d_bigo      VARCHAR(200) NOT NULL DEFAULT '',
    value_type  VARCHAR(10) NOT NULL DEFAULT 'text', -- 'check'(OK/NG) | 'number' | 'text' — 항목별 고정, 1~31일 셀 모두 이 타입으로 입력
    use_yn      CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_condition_daily_check_ym (d_ym)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 이미 만들어진 환경에 value_type 컬럼이 없을 수 있어 방어적으로 추가한다.
-- (MariaDB는 ADD COLUMN IF NOT EXISTS를 지원하지만 구버전 호환을 위해 프로시저로 존재 여부를 확인한다.)
DROP PROCEDURE IF EXISTS sp_add_daily_check_value_type_column;
DELIMITER $$
CREATE PROCEDURE sp_add_daily_check_value_type_column()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'condition_daily_check' AND COLUMN_NAME = 'value_type'
    ) THEN
        ALTER TABLE condition_daily_check ADD COLUMN value_type VARCHAR(10) NOT NULL DEFAULT 'text' AFTER d_bigo;
    END IF;
END$$
DELIMITER ;
CALL sp_add_daily_check_value_type_column();
DROP PROCEDURE sp_add_daily_check_value_type_column;

-- 특정 월에 데이터가 없으면 자동으로 채워 넣는 프로시저.
-- 직전에 데이터가 있던 달이 있으면 그 달의 항목 구성(제목/설명/타입만, 값은 공란)을 그대로 이어받고,
-- 그런 달이 전혀 없을 때(최초 설치 시점)에만 고정 예시 15개로 시작한다.
-- (이전 버전은 매번 이 고정 15개로만 채워서, 어느 한 달에서 항목을 커스터마이징해도 다음 달엔
--  반영되지 않는 문제가 있었다 — 사용자가 9월에 항목을 추가/수정해도 10월엔 안 보인다고 확인.)
DROP PROCEDURE IF EXISTS sp_seed_condition_daily_check;
DELIMITER $$
CREATE PROCEDURE sp_seed_condition_daily_check(IN p_ym VARCHAR(10))
BEGIN
    DECLARE v_prev_ym VARCHAR(10);
    IF (SELECT COUNT(*) FROM condition_daily_check WHERE d_ym = p_ym) = 0 THEN
        SELECT d_ym INTO v_prev_ym
        FROM condition_daily_check
        WHERE d_ym < p_ym AND use_yn = 'Y'
        ORDER BY d_ym DESC
        LIMIT 1;

        IF v_prev_ym IS NOT NULL THEN
            INSERT INTO condition_daily_check (d_title, d_desc, d_ym, value_type)
            SELECT d_title, d_desc, p_ym, value_type
            FROM condition_daily_check
            WHERE d_ym = v_prev_ym AND use_yn = 'Y'
            ORDER BY cnt ASC;
        ELSE
        INSERT INTO condition_daily_check (d_title, d_desc, d_ym, value_type) VALUES
            ('설비 외관 상태 확인', '', p_ym, 'check'),
            ('공기압(에어) 확인', '', p_ym, 'number'),
            ('오일게이지 확인', '', p_ym, 'check'),
            ('N2 가스 압력 확인', '', p_ym, 'number'),
            ('NH3 가스 압력 확인', '', p_ym, 'number'),
            ('C3H8 가스 압력 확인', '', p_ym, 'number'),
            ('냉각수 순환 상태 확인', '', p_ym, 'check'),
            ('온도 컨트롤러(TC) 지시값 확인', '', p_ym, 'number'),
            ('PLC 통신 상태 확인', '', p_ym, 'check'),
            ('버너/히터 작동 상태 확인', '', p_ym, 'check'),
            ('배기 팬 작동 확인', '', p_ym, 'check'),
            ('컨베이어/체인 구동 상태 확인', '', p_ym, 'check'),
            ('안전장치(리밋스위치 등) 작동 확인', '', p_ym, 'check'),
            ('누유/누수 여부 확인', '', p_ym, 'check'),
            ('소음/진동 이상 여부 확인', '', p_ym, 'text');
        END IF;
    END IF;
END$$
DELIMITER ;

-- 조건관리 > 관리계획서 및 작업표준서: 문서 라이브러리(카드형 목록, 미리보기+다운로드).
CREATE TABLE IF NOT EXISTS condition_standard (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    doc_title       VARCHAR(200) NOT NULL DEFAULT '',
    doc_category    VARCHAR(20)  NOT NULL DEFAULT '작업표준서',
    equip_name      VARCHAR(100) NOT NULL DEFAULT '',
    rev_no          VARCHAR(20)  NOT NULL DEFAULT '',
    effective_date  VARCHAR(10)  NOT NULL DEFAULT '',
    file_name       VARCHAR(255) NOT NULL DEFAULT '',
    orig_file_name  VARCHAR(255) NOT NULL DEFAULT '',
    file_size       BIGINT NOT NULL DEFAULT 0,
    remark          VARCHAR(500) NOT NULL DEFAULT '',
    use_yn          CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_condition_standard_category (doc_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 조건관리 > 조절계 관리: 설비×존(zone)별 연간 온도조절계 정도검사(교정) 이력.
CREATE TABLE IF NOT EXISTS condition_controller (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    calib_year      INT NOT NULL,
    equip_name      VARCHAR(100) NOT NULL DEFAULT '',
    zone_name       VARCHAR(100) NOT NULL DEFAULT '',   -- 구분값(존 위치), 자유 입력
    std_temp        DECIMAL(6,2) NULL,                  -- 표준온도 — 미입력은 NULL(0과 구분)
    meas_temp       DECIMAL(6,2) NULL,                  -- 실측온도
    deviation       DECIMAL(6,2) NULL,                  -- 서버가 meas_temp-std_temp로 계산해 저장
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    use_yn          CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_condition_controller_year_equip (calib_year, equip_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 상반기(H1)/하반기(H2)별 다중 첨부파일. 부모만 소프트삭제 대상 — 파일 교체/제거는 즉시 물리삭제.
CREATE TABLE IF NOT EXISTS condition_controller_file (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    controller_id   INT NOT NULL,
    half            VARCHAR(2) NOT NULL,   -- 'H1' | 'H2'
    file_name       VARCHAR(255) NOT NULL DEFAULT '',
    orig_file_name  VARCHAR(255) NOT NULL DEFAULT '',
    file_size       BIGINT NOT NULL DEFAULT 0,
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_condition_controller_file_parent (controller_id, half),
    CONSTRAINT fk_condition_controller_file_parent FOREIGN KEY (controller_id)
        REFERENCES condition_controller(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 조건관리 > 열전대/센서 관리: 설비/존(zone)별 연간 열전대·센서 교체이력. 사용자가 직접 등록/수정/삭제하는
-- 목록이며, 설비명·존구분·구분(sensor_type: 열전대|센서)이 전부 자유 입력이라 고정 시딩 프로시저는 두지 않는다.
-- '이전교체일자'는 저장 컬럼이 아니라 조회 시 LAG(change_date) OVER(PARTITION BY equip_name, zone_name,
-- sensor_type ORDER BY year)로 매번 계산한다(SensorMapper.selectList 참고) — 레퍼런스 시스템의 change_bdate
-- 컬럼이 실사용 데이터에서 항상 NULL로 방치되던 것과 같은 사례를 반복하지 않기 위해 이 컬럼을 만들지 않는다.
CREATE TABLE IF NOT EXISTS condition_sensor (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    year              INT NOT NULL,
    equip_name        VARCHAR(100) NOT NULL DEFAULT '',   -- 설비명 (자유 입력)
    sensor_type       VARCHAR(20)  NOT NULL DEFAULT '열전대', -- 구분: '열전대' | '센서'
    zone_name         VARCHAR(100) NOT NULL DEFAULT '',   -- 존구분/설치위치 (자유 입력)
    change_date       VARCHAR(10)  NOT NULL DEFAULT '',   -- 교체일자(YYYY-MM-DD)
    next_change_date  VARCHAR(10)  NOT NULL DEFAULT '',   -- 차기교체일자(YYYY-MM-DD)
    remark            VARCHAR(300) NOT NULL DEFAULT '',
    reg_user_name     VARCHAR(50)  NOT NULL DEFAULT '',
    use_yn            CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_condition_sensor_year_equip_zone_type (year, equip_name, zone_name, sensor_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 조건관리 > 열처리유성상분석: 설비별 오일 성상분석 결과(PDF 최대 4종) 등록 이력.
-- 4개 고정 슬롯이라 조절계관리(H1/H2)처럼 자식 테이블을 두지 않고 한 행에 트리플릿 4세트로 둔다.
CREATE TABLE IF NOT EXISTS condition_oil_analysis (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    cr_date              VARCHAR(10)  NOT NULL DEFAULT '',   -- 채취일 (YYYY-MM-DD)
    mch_name             VARCHAR(100) NOT NULL DEFAULT '',   -- 설비명 (자유 입력)
    memo                 VARCHAR(255) NOT NULL DEFAULT '',
    box1_file_name       VARCHAR(255) NOT NULL DEFAULT '',   -- ① 분석보고서
    box1_orig_file_name  VARCHAR(255) NOT NULL DEFAULT '',
    box1_file_size       BIGINT       NOT NULL DEFAULT 0,
    box2_file_name       VARCHAR(255) NOT NULL DEFAULT '',   -- ② 냉각시험 그래프
    box2_orig_file_name  VARCHAR(255) NOT NULL DEFAULT '',
    box2_file_size       BIGINT       NOT NULL DEFAULT 0,
    box3_file_name       VARCHAR(255) NOT NULL DEFAULT '',   -- ③ 기타파일1
    box3_orig_file_name  VARCHAR(255) NOT NULL DEFAULT '',
    box3_file_size       BIGINT       NOT NULL DEFAULT 0,
    box4_file_name       VARCHAR(255) NOT NULL DEFAULT '',   -- ④ 기타파일2
    box4_orig_file_name  VARCHAR(255) NOT NULL DEFAULT '',
    box4_file_size       BIGINT       NOT NULL DEFAULT 0,
    use_yn               CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_condition_oil_analysis_mch_date (mch_name, cr_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 품질관리 > 온도균일성보고서: 로(furnace) 유효작업구역 온도균일성조사(TUS) 기록.
-- 편차/판정은 클라이언트가 보낸 값을 믿지 않고 설정온도·최고/최저 실측값·허용오차로 서버가 매번 다시
-- 계산해서 저장한다(조절계 관리의 deviation 계산과 동일한 원칙 — 판정을 수동 드롭다운으로 두면 실측값과
-- 어긋날 수 있어서).
CREATE TABLE IF NOT EXISTS quality_temp_uniform (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    equip_name        VARCHAR(100) NOT NULL DEFAULT '',   -- 설비명
    survey_date       VARCHAR(10)  NOT NULL DEFAULT '',   -- 조사일자 (YYYY-MM-DD)
    set_temp          DECIMAL(6,1) NOT NULL DEFAULT 0,    -- 설정온도(℃)
    max_temp          DECIMAL(6,1) NOT NULL DEFAULT 0,    -- 최고 측정값(℃)
    min_temp          DECIMAL(6,1) NOT NULL DEFAULT 0,    -- 최저 측정값(℃)
    tolerance         DECIMAL(6,1) NOT NULL DEFAULT 10,   -- 허용오차(±℃)
    deviation         DECIMAL(6,1) NOT NULL DEFAULT 0,    -- 계산값: max(|max-set|, |min-set|)
    judgment          VARCHAR(10)  NOT NULL DEFAULT '',   -- 계산값: 합격 | 불합격
    inspector         VARCHAR(50)  NOT NULL DEFAULT '',   -- 검사자
    remark            VARCHAR(300) NOT NULL DEFAULT '',
    file_name         VARCHAR(255) NOT NULL DEFAULT '',   -- 성적서 PDF
    orig_file_name    VARCHAR(255) NOT NULL DEFAULT '',
    file_size         BIGINT       NOT NULL DEFAULT 0,
    reg_user_name     VARCHAR(50)  NOT NULL DEFAULT '',
    use_yn            CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_quality_temp_uniform_equip_date (equip_name, survey_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 설비관리 > SPARE 부품관리: 설비별 스페어부품 마스터. 현재고/재고상태는 저장 컬럼이 아니라
-- equipment_spare_part_history(입출고 이력)에서 매번 계산한다 — 레퍼런스 운영 DB에서
-- now_stock/safe_stock/shortage_stock을 사용자가 직접 덮어쓰다 서로 안 맞게 된 사례를 반복하지 않기 위함.
CREATE TABLE IF NOT EXISTS equipment_spare_part (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    part_name         VARCHAR(100) NOT NULL DEFAULT '',   -- 품명
    equip_name        VARCHAR(100) NOT NULL DEFAULT '',   -- 적용설비
    standard          VARCHAR(100) NOT NULL DEFAULT '',   -- 규격
    maker             VARCHAR(100) NOT NULL DEFAULT '',   -- 제작업체
    unit              VARCHAR(20)  NOT NULL DEFAULT 'EA', -- 단위
    safe_stock        INT          NOT NULL DEFAULT 0,    -- 안전재고(임계값)
    replace_type      VARCHAR(20)  NOT NULL DEFAULT '',   -- 교체유형: 상시 | 정기
    buy_cycle         VARCHAR(20)  NOT NULL DEFAULT '',   -- 구매주기: 월 | 반기 | 년 | 수시
    storage_location  VARCHAR(100) NOT NULL DEFAULT '',   -- 보관위치
    rack_no           VARCHAR(50)  NOT NULL DEFAULT '',   -- 랙번호
    remark            VARCHAR(300) NOT NULL DEFAULT '',
    reg_user_name     VARCHAR(50)  NOT NULL DEFAULT '',
    use_yn            CHAR(1) NOT NULL DEFAULT 'Y',
    reg_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_equipment_spare_part_equip (equip_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS equipment_spare_part_history (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    spare_part_id     INT NOT NULL,
    type              VARCHAR(3) NOT NULL,                -- IN(입고) | OUT(사용)
    qty               INT NOT NULL DEFAULT 1,
    work_desc         VARCHAR(300) NOT NULL DEFAULT '',   -- 작업내용/비고
    reg_user_name     VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_equipment_spare_part_history_part (spare_part_id, reg_dt),
    CONSTRAINT fk_equipment_spare_part_history_part FOREIGN KEY (spare_part_id)
        REFERENCES equipment_spare_part(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 거래처관리.
-- 목록에는 코드/거래처명/구분/대표자/사업자번호/대표전화/담당자/사용여부/등록일만 보이고,
-- 업태·종목·주소·담당자 이메일·팩스·비고는 등록/수정 화면에서만 다룬다.
-- 거래가 끊긴 업체는 지우지 말고 use_yn='N'(미사용)으로 돌린다.
CREATE TABLE IF NOT EXISTS base_vendor (
    vendor_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    vendor_code     VARCHAR(20)  NOT NULL,                -- 거래처코드. 비워서 등록하면 서버가 V0001 형식으로 채번
    vendor_name     VARCHAR(100) NOT NULL,                -- 거래처명
    vendor_type     VARCHAR(10)  NOT NULL DEFAULT '매출처', -- 구분: 매출처 | 매입처 | 외주처 | 겸용
    ceo_name        VARCHAR(50)  NOT NULL DEFAULT '',     -- 대표자
    biz_no          VARCHAR(12)  NOT NULL DEFAULT '',     -- 사업자번호 000-00-00000
    biz_type        VARCHAR(50)  NOT NULL DEFAULT '',     -- 업태
    biz_item        VARCHAR(100) NOT NULL DEFAULT '',     -- 종목
    tel             VARCHAR(20)  NOT NULL DEFAULT '',     -- 대표전화
    fax             VARCHAR(20)  NOT NULL DEFAULT '',     -- 팩스
    zip_code        VARCHAR(10)  NOT NULL DEFAULT '',     -- 우편번호
    address         VARCHAR(200) NOT NULL DEFAULT '',     -- 기본주소
    address_detail  VARCHAR(200) NOT NULL DEFAULT '',     -- 상세주소
    manager_name    VARCHAR(50)  NOT NULL DEFAULT '',     -- 담당자
    manager_phone   VARCHAR(20)  NOT NULL DEFAULT '',     -- 담당자 연락처
    manager_email   VARCHAR(100) NOT NULL DEFAULT '',     -- 담당자 이메일
    remark          VARCHAR(300) NOT NULL DEFAULT '',
    use_yn          CHAR(1) NOT NULL DEFAULT 'Y',
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_vendor_code (vendor_code),
    INDEX idx_base_vendor_name (vendor_name),
    INDEX idx_base_vendor_biz_no (biz_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 제품관리. 거래처는 base_vendor를 참조(이름을 복사해 두지 않는다 — 거래처명이 바뀌면 같이 바뀌어야 함).
-- 같은 거래처 안에서 품번은 하나뿐, 거래처가 다르면 품번이 같아도 된다.
-- 경도는 단위(HRC/HV/HB/HRB)를 같이 저장해야 "58"이 무슨 값인지 알 수 있다.
CREATE TABLE IF NOT EXISTS base_product (
    product_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_code       VARCHAR(20)  NOT NULL,                 -- 제품코드. 비워서 등록하면 서버가 P0001 형식으로 채번
    vendor_id          BIGINT       NOT NULL,                 -- 거래처 (base_vendor)
    part_no            VARCHAR(50)  NOT NULL,                 -- 품번
    product_name       VARCHAR(100) NOT NULL,                 -- 품명
    material           VARCHAR(50)  NOT NULL DEFAULT '',      -- 재질 (SCM415, S45C ...)
    spec               VARCHAR(100) NOT NULL DEFAULT '',      -- 규격
    charge_weight_kg   DECIMAL(10,2) NULL,                    -- 1회(1차지) 장입량 kg
    unit_weight_g      DECIMAL(10,2) NULL,                    -- 개당 중량 g
    unit_price         DECIMAL(12,2) NULL,                    -- 단가 (원)
    price_unit         VARCHAR(2)   NOT NULL DEFAULT 'KG',    -- 단가 기준: KG(kg당) | EA(개당)
    surface_hard_min   DECIMAL(6,1) NULL,                     -- 표면경도(퀜칭) 하한
    surface_hard_max   DECIMAL(6,1) NULL,                     -- 표면경도(퀜칭) 상한
    surface_hard_unit  VARCHAR(5)   NOT NULL DEFAULT 'HRC',
    core_hard_min      DECIMAL(6,1) NULL,                     -- 심부경도 하한
    core_hard_max      DECIMAL(6,1) NULL,                     -- 심부경도 상한
    core_hard_unit     VARCHAR(5)   NOT NULL DEFAULT 'HRC',
    remark             VARCHAR(300) NOT NULL DEFAULT '',
    use_yn             CHAR(1) NOT NULL DEFAULT 'Y',
    reg_user_name      VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_product_code (product_code),
    UNIQUE KEY uq_base_product_vendor_part (vendor_id, part_no),
    INDEX idx_base_product_name (product_name),
    CONSTRAINT fk_base_product_vendor FOREIGN KEY (vendor_id) REFERENCES base_vendor(vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 제품 이미지(최대 5장). slot 1이 대표 이미지. 파일은 app.product-image-dir(기본 D:/ym_img)/product/{product_id}/ 에 저장.
-- 썸네일은 브라우저에서 만들어 같이 올린다 — 휴대폰 사진의 EXIF 회전을 브라우저는 반영하지만 Java ImageIO는 무시해서
-- 서버에서 만들면 목록 썸네일만 옆으로 누워 보이는 문제가 생기기 때문.
CREATE TABLE IF NOT EXISTS base_product_image (
    image_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id        BIGINT       NOT NULL,
    slot              TINYINT      NOT NULL,                  -- 1~5
    orig_file_name    VARCHAR(255) NOT NULL DEFAULT '',
    file_name         VARCHAR(100) NOT NULL,                  -- 저장된 원본 파일명
    thumb_file_name   VARCHAR(100) NOT NULL DEFAULT '',       -- 저장된 썸네일 파일명(없으면 원본으로 대신)
    file_size         BIGINT       NOT NULL DEFAULT 0,
    reg_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_product_image_slot (product_id, slot),
    CONSTRAINT fk_base_product_image_product FOREIGN KEY (product_id)
        REFERENCES base_product(product_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 패턴관리 (열처리 조건). 한 제품에 패턴이 여러 개일 수 있다(라인·조건별) — pattern_name으로 구분.
-- 거래처·품번·품명·규격·재질·경도는 base_product에서 끌어다 보여주고 여기 복사하지 않는다.
-- 장입량은 제품에도 있지만 패턴마다 다를 수 있어 패턴에도 둔다(등록 시 제품 값을 기본으로 채움).
CREATE TABLE IF NOT EXISTS base_pattern (
    pattern_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    pattern_code      VARCHAR(20)  NOT NULL,                -- 패턴코드. 비워서 등록하면 서버가 PT0001 형식으로 채번
    pattern_name      VARCHAR(100) NOT NULL DEFAULT '',     -- 패턴명 (같은 제품의 패턴끼리 구분: "1라인 기본" 등)
    product_id        BIGINT       NOT NULL,                -- 제품 (base_product)
    charge_weight_kg  DECIMAL(10,2) NULL,                   -- 장입량 kg
    q1_zone           DECIMAL(6,1) NULL,                    -- 퀜칭로 1~5존 온도 ℃
    q2_zone           DECIMAL(6,1) NULL,
    q3_zone           DECIMAL(6,1) NULL,
    q4_zone           DECIMAL(6,1) NULL,
    q5_zone           DECIMAL(6,1) NULL,
    quench_speed      DECIMAL(8,2) NULL,                    -- 퀜칭로 속도 (speed_unit)
    cp                DECIMAL(4,2) NULL,                    -- 카본포텐셜 %
    t1_zone           DECIMAL(6,1) NULL,                    -- 템퍼링로 1~5존 온도 ℃
    t2_zone           DECIMAL(6,1) NULL,
    t3_zone           DECIMAL(6,1) NULL,
    t4_zone           DECIMAL(6,1) NULL,
    t5_zone           DECIMAL(6,1) NULL,
    temper_speed      DECIMAL(8,2) NULL,                    -- 템퍼링로 속도 (speed_unit)
    speed_unit        VARCHAR(10)  NOT NULL DEFAULT 'Hz',   -- 속도 단위: Hz | mm/min | m/h
    remark            VARCHAR(300) NOT NULL DEFAULT '',
    use_yn            CHAR(1) NOT NULL DEFAULT 'Y',
    reg_user_name     VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_name     VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_pattern_code (pattern_code),
    INDEX idx_base_pattern_product (product_id),
    CONSTRAINT fk_base_pattern_product FOREIGN KEY (product_id) REFERENCES base_product(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 패턴 변경 이력 — 누가 언제 어느 값을 무엇에서 무엇으로 바꿨는지(품질 감사 대응).
-- 패턴을 지워도 이력은 남아야 해서 FK를 걸지 않고 pattern_code를 같이 적어 둔다.
-- 등록/삭제는 한 줄(field_label 빈 값), 수정은 바뀐 칸마다 한 줄.
CREATE TABLE IF NOT EXISTS base_pattern_hist (
    hist_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    pattern_id     BIGINT       NOT NULL,
    pattern_code   VARCHAR(20)  NOT NULL DEFAULT '',
    action         VARCHAR(10)  NOT NULL,                  -- 등록 | 수정 | 삭제
    field_label    VARCHAR(50)  NOT NULL DEFAULT '',       -- 바뀐 항목 (예: 퀜칭로 3존)
    before_value   VARCHAR(200) NOT NULL DEFAULT '',
    after_value    VARCHAR(200) NOT NULL DEFAULT '',
    user_name      VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_base_pattern_hist_pattern (pattern_id, reg_dt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 설비관리. 설비 마스터(연속열처리로 1~6호기 등).
-- 비가동 내역(base_downtime)이 이 표를 참조하므로, 쓰지 않는 설비는 지우지 말고 use_yn='N'으로 돌린다.
-- 설비 상태: 가동 | 정지 | 고장 | 점검 | 유지보수 (현재 상태를 사람이 관리. PLC 신호 연동 후에는 자동 갱신 예정)
CREATE TABLE IF NOT EXISTS base_equipment (
    equip_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    equip_code      VARCHAR(20)  NOT NULL,                -- 설비코드 (예: MBF1)
    equip_name      VARCHAR(100) NOT NULL,                -- 설비명
    equip_type      VARCHAR(50)  NOT NULL DEFAULT '',     -- 설비 유형 (예: 연속열처리로)
    maker           VARCHAR(100) NOT NULL DEFAULT '',     -- 제조사
    model_name      VARCHAR(100) NOT NULL DEFAULT '',     -- 모델명
    manager_name    VARCHAR(50)  NOT NULL DEFAULT '',     -- 관리 담당자
    install_date    DATE NULL,                            -- 설치일
    start_date      DATE NULL,                            -- 가동 개시일
    equip_status    VARCHAR(10)  NOT NULL DEFAULT '가동', -- 가동 | 정지 | 고장 | 점검 | 유지보수
    plc_model       VARCHAR(100) NOT NULL DEFAULT '',     -- PLC 모델
    plc_ip          VARCHAR(45)  NOT NULL DEFAULT '',     -- PLC IP
    plc_protocol    VARCHAR(50)  NOT NULL DEFAULT '',     -- 통신방식 (예: MC Protocol (TCP))
    remark          VARCHAR(300) NOT NULL DEFAULT '',
    use_yn          CHAR(1) NOT NULL DEFAULT 'Y',
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_equipment_code (equip_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 비가동관리 — 비가동 사유 기준정보(수동 등록 때 고르는 목록).
-- 구분: 계획정지 | 고장정지 | 대기 | 기타. 쓰인 사유는 지우지 말고 use_yn='N'.
CREATE TABLE IF NOT EXISTS base_downtime_reason (
    reason_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    reason_code     VARCHAR(20)  NOT NULL,                -- 사유코드. 비워서 등록하면 DR001 형식으로 채번
    reason_name     VARCHAR(100) NOT NULL,                -- 사유명
    reason_type     VARCHAR(10)  NOT NULL DEFAULT '계획정지', -- 계획정지 | 고장정지 | 대기 | 기타
    sort_order      INT NOT NULL DEFAULT 0,               -- 선택 목록 순서
    remark          VARCHAR(300) NOT NULL DEFAULT '',
    use_yn          CHAR(1) NOT NULL DEFAULT 'Y',
    reg_user_id     VARCHAR(50)  NOT NULL DEFAULT '',     -- 등록자 로그인 ID
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_id     VARCHAR(50)  NOT NULL DEFAULT '',     -- 마지막 수정자 로그인 ID
    upd_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_downtime_reason_code (reason_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 비가동관리 — 비가동 내역. 설비 1대당 1건.
-- 화면에서 설비를 여러 대 골라 한 번에 등록하면 설비마다 1건씩 같은 내용으로 들어간다.
-- end_dt가 NULL이면 아직 진행 중. source: MANUAL(사용자 수동 등록) | PLC(신호 연동 — 추후)
CREATE TABLE IF NOT EXISTS base_downtime (
    downtime_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
    equip_id        BIGINT NOT NULL,
    reason_id       BIGINT NOT NULL,
    start_dt        DATETIME NOT NULL,
    end_dt          DATETIME NULL,
    source          VARCHAR(10)  NOT NULL DEFAULT 'MANUAL',
    memo            VARCHAR(300) NOT NULL DEFAULT '',
    reg_user_id     VARCHAR(50)  NOT NULL DEFAULT '',     -- 등록자 로그인 ID
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_id     VARCHAR(50)  NOT NULL DEFAULT '',     -- 마지막 수정자 로그인 ID
    upd_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_base_downtime_equip_start (equip_id, start_dt),
    INDEX idx_base_downtime_start (start_dt),
    CONSTRAINT fk_base_downtime_equip FOREIGN KEY (equip_id) REFERENCES base_equipment(equip_id),
    CONSTRAINT fk_base_downtime_reason FOREIGN KEY (reason_id) REFERENCES base_downtime_reason(reason_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 설비관리 > 설비이력관리 — 설비 생애주기 기록(점검·교체·변경·설치·개조·수리 등).
-- 수리이력이 '완료'되면 repair_id를 단 '수리' 이력이 자동으로 생기고, 그 행은 수리이력에서만 고친다.
CREATE TABLE IF NOT EXISTS equipment_history (
    hist_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    hist_no         VARCHAR(20)  NOT NULL,                -- 이력번호 EQH-YYYYMM-NNN (자동 채번)
    equip_id        BIGINT NOT NULL,                      -- 설비 (base_equipment)
    hist_type       VARCHAR(20)  NOT NULL DEFAULT '점검', -- 점검 | 교체 | 변경 | 설치 | 개조 | 수리 | 기타
    title           VARCHAR(200) NOT NULL,                -- 이력 제목
    content         TEXT NULL,                            -- 작업 내용
    work_dt         DATETIME NOT NULL,                    -- 발생(작업)일시
    worker_name     VARCHAR(50)  NOT NULL DEFAULT '',     -- 실제 작업자
    repair_id       BIGINT NULL,                          -- 수리이력에서 자동 생성된 행이면 그 수리
    reg_user_id     VARCHAR(50)  NOT NULL DEFAULT '',
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_id     VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_equipment_history_no (hist_no),
    UNIQUE KEY uq_equipment_history_repair (repair_id),
    INDEX idx_equipment_history_equip_dt (equip_id, work_dt),
    INDEX idx_equipment_history_dt (work_dt),
    CONSTRAINT fk_equipment_history_equip FOREIGN KEY (equip_id) REFERENCES base_equipment(equip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 설비관리 > 수리이력관리 — 고장 발생부터 복구까지.
-- 상태: 접수 | 진행 | 완료 | 보류 | 재수리필요. 총 수리비 = 부품비 + 외주비(조회 때 계산).
CREATE TABLE IF NOT EXISTS equipment_repair_hist (
    repair_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    repair_no       VARCHAR(20)  NOT NULL,                -- 수리번호 REP-YYYYMM-NNN (자동 채번)
    equip_id        BIGINT NOT NULL,
    fail_dt         DATETIME NOT NULL,                    -- 고장 발생일시
    fail_type       VARCHAR(50)  NOT NULL DEFAULT '',     -- 고장 유형 (히터 단선, 열전대 이상, ...)
    alarm_code      VARCHAR(50)  NOT NULL DEFAULT '',     -- 알람 코드
    symptom         VARCHAR(500) NOT NULL DEFAULT '',     -- 고장 증상
    cause           TEXT NULL,                            -- 원인 분석
    action          TEXT NULL,                            -- 조치 내용
    repairer_name   VARCHAR(50)  NOT NULL DEFAULT '',     -- 수리 담당자
    repair_kind     VARCHAR(10)  NOT NULL DEFAULT '자체', -- 자체 | 외주
    vendor_name     VARCHAR(100) NOT NULL DEFAULT '',     -- 외주 업체
    start_dt        DATETIME NULL,                        -- 수리 시작
    end_dt          DATETIME NULL,                        -- 수리 완료
    recover_dt      DATETIME NULL,                        -- 정상 가동 복구
    test_result     VARCHAR(10)  NOT NULL DEFAULT '',     -- 시운전 결과: 정상 | 이상 | ''(미실시)
    status          VARCHAR(10)  NOT NULL DEFAULT '접수',
    part_cost       BIGINT NOT NULL DEFAULT 0,            -- 부품비(원)
    outsource_cost  BIGINT NOT NULL DEFAULT 0,            -- 외주비(원)
    reg_user_id     VARCHAR(50)  NOT NULL DEFAULT '',
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_id     VARCHAR(50)  NOT NULL DEFAULT '',
    upd_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_equipment_repair_no (repair_no),
    INDEX idx_equipment_repair_equip_dt (equip_id, fail_dt),
    INDEX idx_equipment_repair_dt (fail_dt),
    CONSTRAINT fk_equipment_repair_equip FOREIGN KEY (equip_id) REFERENCES base_equipment(equip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 수리 때 교체한 부품(여러 개)
CREATE TABLE IF NOT EXISTS equipment_repair_part (
    part_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    repair_id       BIGINT NOT NULL,
    part_name       VARCHAR(100) NOT NULL,
    part_no         VARCHAR(100) NOT NULL DEFAULT '',
    qty             DECIMAL(10,2) NOT NULL DEFAULT 1,
    sort_order      INT NOT NULL DEFAULT 0,
    INDEX idx_equipment_repair_part_repair (repair_id),
    CONSTRAINT fk_equipment_repair_part_repair FOREIGN KEY (repair_id) REFERENCES equipment_repair_hist(repair_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 설비이력·수리이력 첨부파일(여러 개). ref_type: HISTORY | REPAIR, 실제 파일은 {app.equipment-file-dir}/stored_path
CREATE TABLE IF NOT EXISTS equipment_attach (
    attach_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    ref_type        VARCHAR(10)  NOT NULL,
    ref_id          BIGINT NOT NULL,
    orig_name       VARCHAR(255) NOT NULL,
    stored_path     VARCHAR(300) NOT NULL,
    file_size       BIGINT NOT NULL DEFAULT 0,
    content_type    VARCHAR(100) NOT NULL DEFAULT '',
    reg_user_id     VARCHAR(50)  NOT NULL DEFAULT '',
    reg_user_name   VARCHAR(50)  NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_equipment_attach_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 기준정보 > 경도관리 — 품번·검사항목별 경도 규격. 지금은 품번을 직접 입력하고, 나중에 제품(base_product)을 골라 product_id로 잇는다.
CREATE TABLE IF NOT EXISTS base_hardness_spec (
    spec_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id      BIGINT NULL,                          -- 나중에 제품관리와 연결(지금은 비워 둠)
    part_no         VARCHAR(50)  NOT NULL,                -- 품번(직접 입력)
    product_name    VARCHAR(100) NOT NULL DEFAULT '',     -- 품명(선택)
    item_name       VARCHAR(30)  NOT NULL,                -- 검사 항목: 표면 경도 / 심부 경도 / 유효경화깊이 ...
    unit            VARCHAR(10)  NOT NULL DEFAULT 'HV',   -- HV / HRC / HRA / HRB / HB / mm
    lsl             DECIMAL(10,3) NULL,                   -- 하한(없으면 NULL)
    usl             DECIMAL(10,3) NULL,                   -- 상한(없으면 NULL)
    target          DECIMAL(10,3) NULL,                   -- 목표(중심)값
    decimals        TINYINT NOT NULL DEFAULT 1,           -- 표시 소수 자리
    sample_size     TINYINT NOT NULL DEFAULT 5,           -- 한 세트(초·중·종물)에 재는 개수 = 경도1~n
    use_yn          CHAR(1) NOT NULL DEFAULT 'Y',
    remark          VARCHAR(300) NOT NULL DEFAULT '',
    reg_user_id     VARCHAR(50) NOT NULL DEFAULT '',
    reg_user_name   VARCHAR(50) NOT NULL DEFAULT '',
    upd_user_id     VARCHAR(50) NOT NULL DEFAULT '',
    upd_user_name   VARCHAR(50) NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_base_hardness_spec_part_item (part_no, item_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 품질관리 > 경도측정 — 측정 1건(한 LOT·한 검사항목). 규격 값은 측정 당시 값을 그대로 복사해 둔다(규격이 바뀌어도 판정 유지).
-- status: 측정중 | 완료, receiving='Y'인 측정 1건이 경도계(C# 연동) 값을 자동으로 받는다.
CREATE TABLE IF NOT EXISTS quality_hardness_meas (
    meas_id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    meas_no         VARCHAR(20)  NOT NULL,                -- 측정번호 HDM-YYYYMM-NNN
    spec_id         BIGINT NOT NULL,
    part_no         VARCHAR(50)  NOT NULL,
    product_name    VARCHAR(100) NOT NULL DEFAULT '',
    item_name       VARCHAR(30)  NOT NULL,
    unit            VARCHAR(10)  NOT NULL,
    lsl             DECIMAL(10,3) NULL,
    usl             DECIMAL(10,3) NULL,
    sample_size     TINYINT NOT NULL DEFAULT 5,
    lot_no          VARCHAR(30)  NOT NULL DEFAULT '',     -- LOT번호(지금은 직접 입력)
    equip_code      VARCHAR(20)  NOT NULL DEFAULT '',     -- 설비(선택)
    meas_dt         DATETIME NOT NULL,                    -- 측정 시작 일시
    status          VARCHAR(10)  NOT NULL DEFAULT '측정중',
    judgement       VARCHAR(10)  NOT NULL DEFAULT '',     -- 합격 | 불합격 | ''(측정중)
    receiving       CHAR(1) NOT NULL DEFAULT 'N',
    worker_name     VARCHAR(50)  NOT NULL DEFAULT '',
    remark          VARCHAR(300) NOT NULL DEFAULT '',
    completed_dt    DATETIME NULL,
    reg_user_id     VARCHAR(50) NOT NULL DEFAULT '',
    reg_user_name   VARCHAR(50) NOT NULL DEFAULT '',
    upd_user_id     VARCHAR(50) NOT NULL DEFAULT '',
    upd_user_name   VARCHAR(50) NOT NULL DEFAULT '',
    reg_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_quality_hardness_meas_no (meas_no),
    INDEX idx_quality_hardness_meas_spec_dt (spec_id, meas_dt),
    INDEX idx_quality_hardness_meas_dt (meas_dt),
    CONSTRAINT fk_quality_hardness_meas_spec FOREIGN KEY (spec_id) REFERENCES base_hardness_spec(spec_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 측정 세트 — 초물 / 중물 / 종물(필요하면 더 추가). 세트 하나가 CPK의 부분군 하나.
CREATE TABLE IF NOT EXISTS quality_hardness_set (
    set_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    meas_id         BIGINT NOT NULL,
    set_type        VARCHAR(10) NOT NULL,                 -- 초물 | 중물 | 종물
    seq             INT NOT NULL DEFAULT 0,               -- 화면·자동 입력 순서
    INDEX idx_quality_hardness_set_meas (meas_id, seq),
    CONSTRAINT fk_quality_hardness_set_meas FOREIGN KEY (meas_id) REFERENCES quality_hardness_meas(meas_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 측정값 — 세트 안 경도1~n. 값 하나 = 시료 1개(여러 점을 쟀으면 평균 1개 값).
-- source: AUTO(경도계 자동 수신) | MANUAL(수동 입력)
CREATE TABLE IF NOT EXISTS quality_hardness_value (
    value_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    set_id          BIGINT NOT NULL,
    idx             TINYINT NOT NULL,                     -- 1~n (경도1~경도n)
    value           DECIMAL(10,3) NOT NULL,
    source          VARCHAR(10) NOT NULL DEFAULT 'MANUAL',
    device_id       VARCHAR(50) NOT NULL DEFAULT '',
    measured_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_quality_hardness_value_slot (set_id, idx),
    CONSTRAINT fk_quality_hardness_value_set FOREIGN KEY (set_id) REFERENCES quality_hardness_set(set_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- 조건관리 > 설비점검표 (현장 종이 '설비점검표' 양식을 그대로 옮긴 것)
--   점검표(양식) 1장 = 설비 1대. 항목은 사용자가 설정. 기록은 월(ym) 단위로 쌓인다.
-- =====================================================================

-- 점검표(양식) — 머리 영역(제목/설비명/모델NO), 범례·주기 범례·결재란·하단 문구를 편집 모드에서 고친다
CREATE TABLE IF NOT EXISTS condition_equip_check_sheet (
    sheet_id      BIGINT       NOT NULL AUTO_INCREMENT,
    title         VARCHAR(50)  NOT NULL DEFAULT '설비점검표',
    equip_name    VARCHAR(100) NOT NULL,
    model_no      VARCHAR(100) NULL,
    legend_json   VARCHAR(1000) NULL COMMENT '범례 [{"mark":"○","label":"양호"},…] — 첫 번째가 양호(전체 양호에 쓰임)',
    cycle_json    VARCHAR(1000) NULL COMMENT '주기 범례 [{"code":"D","label":"매일"},…]',
    sign_json     VARCHAR(300)  NULL COMMENT '결재란 이름 ["담당","검토","확인"]',
    footer_note   VARCHAR(300)  NULL COMMENT '하단 안내 문구',
    sort_order    INT          NOT NULL DEFAULT 0,
    use_yn        CHAR(1)      NOT NULL DEFAULT 'Y',
    reg_user_id   VARCHAR(50)  NULL,
    reg_user_name VARCHAR(50)  NULL,
    reg_dt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_user_id   VARCHAR(50)  NULL,
    upd_user_name VARCHAR(50)  NULL,
    upd_dt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (sheet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='설비점검표 양식';

-- 점검 항목 — 점검개소 / 점검항목 / 주기 / 사진(1장)
-- 기록이 있는 항목을 지우면 use_yn='N'으로만 숨겨서 지난 달 기록은 그대로 보이게 한다
CREATE TABLE IF NOT EXISTS condition_equip_check_item (
    item_id     BIGINT       NOT NULL AUTO_INCREMENT,
    sheet_id    BIGINT       NOT NULL,
    location    VARCHAR(100) NULL COMMENT '점검개소',
    item_name   VARCHAR(200) NOT NULL COMMENT '점검항목(기준 포함, 예: 180 ± 10 °C)',
    cycle       VARCHAR(10)  NOT NULL DEFAULT 'D' COMMENT '주기 코드(주기 범례의 code)',
    photo_path  VARCHAR(300) NULL,
    photo_name  VARCHAR(255) NULL,
    photo_type  VARCHAR(100) NULL,
    seq         INT          NOT NULL DEFAULT 0,
    use_yn      CHAR(1)      NOT NULL DEFAULT 'Y',
    reg_dt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id),
    KEY idx_equip_check_item_sheet (sheet_id, seq),
    CONSTRAINT fk_equip_check_item_sheet FOREIGN KEY (sheet_id)
        REFERENCES condition_equip_check_sheet (sheet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='설비점검표 항목';

-- 월 점검표 — 점검 년월마다 1행: 머리의 점검자, 특기사항, 결재(담당/검토/확인)
CREATE TABLE IF NOT EXISTS condition_equip_check_month (
    month_id        BIGINT      NOT NULL AUTO_INCREMENT,
    sheet_id        BIGINT      NOT NULL,
    ym              CHAR(7)     NOT NULL COMMENT 'YYYY-MM',
    inspector_name  VARCHAR(50) NULL COMMENT '머리의 점검자',
    remark          TEXT        NULL COMMENT '특기사항',
    -- 결재: 결재한 사용자(취소 권한 확인용) + 서명 이름 + 마우스/터치 서명 이미지(PNG data URL, 없으면 이름만)
    sign1_user_id   VARCHAR(50) NULL, sign1_name VARCHAR(50) NULL, sign1_dt DATETIME NULL, sign1_img MEDIUMTEXT NULL,
    sign2_user_id   VARCHAR(50) NULL, sign2_name VARCHAR(50) NULL, sign2_dt DATETIME NULL, sign2_img MEDIUMTEXT NULL,
    sign3_user_id   VARCHAR(50) NULL, sign3_name VARCHAR(50) NULL, sign3_dt DATETIME NULL, sign3_img MEDIUMTEXT NULL,
    reg_dt          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt          DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (month_id),
    UNIQUE KEY uk_equip_check_month (sheet_id, ym),
    CONSTRAINT fk_equip_check_month_sheet FOREIGN KEY (sheet_id)
        REFERENCES condition_equip_check_sheet (sheet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='설비점검표 월 기록(머리·특기사항·결재)';

-- 일별 점검 결과 — 항목 × 날짜 1칸. 점검자(하단 점검자 줄)도 여기서 나온다
CREATE TABLE IF NOT EXISTS condition_equip_check_result (
    result_id   BIGINT      NOT NULL AUTO_INCREMENT,
    item_id     BIGINT      NOT NULL,
    ym          CHAR(7)     NOT NULL,
    day         TINYINT     NOT NULL,
    mark        VARCHAR(5)  NOT NULL COMMENT '범례 기호(○ △ □ X …)',
    user_id     VARCHAR(50) NULL,
    user_name   VARCHAR(50) NULL,
    checked_dt  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (result_id),
    UNIQUE KEY uk_equip_check_result (item_id, ym, day),
    KEY idx_equip_check_result_ym (ym, day),
    CONSTRAINT fk_equip_check_result_item FOREIGN KEY (item_id)
        REFERENCES condition_equip_check_item (item_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='설비점검표 일별 결과';

-- 항목별 '정기 점검' 칸(월마다 메모 한 줄)
CREATE TABLE IF NOT EXISTS condition_equip_check_note (
    item_id  BIGINT       NOT NULL,
    ym       CHAR(7)      NOT NULL,
    note     VARCHAR(200) NULL,
    upd_dt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (item_id, ym),
    CONSTRAINT fk_equip_check_note_item FOREIGN KEY (item_id)
        REFERENCES condition_equip_check_item (item_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='설비점검표 정기 점검 메모';

-- 관리책임자 확인란 — 주(1~7, 8~14, 15~21, 22~28, 29~말일)마다 확인
CREATE TABLE IF NOT EXISTS condition_equip_check_confirm (
    sheet_id    BIGINT      NOT NULL,
    ym          CHAR(7)     NOT NULL,
    week_no     TINYINT     NOT NULL COMMENT '1~5',
    user_id     VARCHAR(50) NULL,
    user_name   VARCHAR(50) NULL COMMENT '서명 이름',
    sign_img    MEDIUMTEXT  NULL COMMENT '서명 이미지(PNG data URL) — 없으면 이름만',
    confirm_dt  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sheet_id, ym, week_no),
    CONSTRAINT fk_equip_check_confirm_sheet FOREIGN KEY (sheet_id)
        REFERENCES condition_equip_check_sheet (sheet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='설비점검표 관리책임자 주간 확인';

-- =====================================================================
-- 생산관리 > 열처리 CHECK SHEET + 경도 규격 호기별 + 비가동·부적합 연동
-- =====================================================================

-- 경도 규격: 같은 품번도 호기마다 규격이 다르다 → (호기, 품번, 검사항목)
ALTER TABLE base_hardness_spec
    ADD COLUMN equip_code VARCHAR(20) NOT NULL COMMENT '호기(설비코드) — 같은 품번도 호기마다 규격이 다르다' AFTER spec_id,
    DROP INDEX uq_base_hardness_spec_part_item,
    ADD UNIQUE KEY uq_base_hardness_spec_equip_part_item (equip_code, part_no, item_name);

-- 경도 측정: CHECK SHEET 행에서 입력된 측정이면 그 행(값은 경도측정 테이블 한 곳에만 저장)
ALTER TABLE quality_hardness_meas
    ADD COLUMN check_row_id BIGINT NULL COMMENT 'CHECK SHEET 행에서 입력된 측정이면 그 행' AFTER spec_id,
    ADD KEY idx_hardness_meas_check_row (check_row_id);

-- 비가동 사유: CHECK SHEET 코드표 그룹(설비문제(기계) 등)
ALTER TABLE base_downtime_reason
    ADD COLUMN reason_group VARCHAR(30) NULL COMMENT '그룹(설비문제(기계)·설비문제(전기)·생산·생산관리·영업부문·공통문제)' AFTER reason_type;

-- 비가동: CHECK SHEET 행에서 생긴 기록이면 그 행
ALTER TABLE base_downtime
    ADD COLUMN check_row_id BIGINT NULL COMMENT 'CHECK SHEET 행에서 생긴 비가동이면 그 행(source=SHEET)' AFTER source,
    ADD KEY idx_downtime_check_row (check_row_id);

-- 불량 구분 (CHECK SHEET 불량구분표 · 부적합품관리)
CREATE TABLE IF NOT EXISTS quality_defect_type (
    defect_id   BIGINT       NOT NULL AUTO_INCREMENT,
    defect_code VARCHAR(10)  NOT NULL,
    defect_name VARCHAR(50)  NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    use_yn      CHAR(1)      NOT NULL DEFAULT 'Y',
    reg_dt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (defect_id),
    UNIQUE KEY uk_quality_defect_code (defect_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='불량 구분';

-- 부적합품
CREATE TABLE IF NOT EXISTS quality_nonconform (
    nc_id         BIGINT        NOT NULL AUTO_INCREMENT,
    nc_no         VARCHAR(20)   NOT NULL COMMENT 'NC-YYYYMM-NNN',
    occur_date    DATE          NOT NULL,
    equip_code    VARCHAR(20)   NULL,
    part_no       VARCHAR(50)   NULL,
    product_name  VARCHAR(100)  NULL,
    lot_no        VARCHAR(30)   NULL,
    defect_code   VARCHAR(10)   NULL,
    defect_name   VARCHAR(50)   NULL COMMENT '등록 당시 불량 구분 이름',
    qty           DECIMAL(12,2) NOT NULL DEFAULT 0,
    unit          VARCHAR(10)   NOT NULL DEFAULT 'EA',
    status        VARCHAR(10)   NOT NULL DEFAULT '대기' COMMENT '대기 / 처리중 / 완료',
    disposition   VARCHAR(20)   NULL COMMENT '폐기 / 재작업 / 선별 / 특채 / 반품',
    action_note   VARCHAR(500)  NULL,
    source        VARCHAR(10)   NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL / SHEET',
    check_row_id  BIGINT        NULL COMMENT 'CHECK SHEET 행에서 생긴 부적합이면 그 행',
    remark        VARCHAR(300)  NULL,
    reg_user_id   VARCHAR(50)   NULL,
    reg_user_name VARCHAR(50)   NULL,
    reg_dt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_user_id   VARCHAR(50)   NULL,
    upd_user_name VARCHAR(50)   NULL,
    upd_dt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (nc_id),
    UNIQUE KEY uk_quality_nonconform_no (nc_no),
    KEY idx_quality_nonconform_date (occur_date),
    KEY idx_quality_nonconform_row (check_row_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='부적합품';

-- 열처리 CHECK SHEET — 호기 × 생산일자 한 장(행은 통 단위로 계속 늘어난다)
CREATE TABLE IF NOT EXISTS prod_check_sheet (
    sheet_id      BIGINT       NOT NULL AUTO_INCREMENT,
    equip_code    VARCHAR(20)  NOT NULL COMMENT '호기',
    prod_date     DATE         NOT NULL COMMENT '생산일자',
    worker_day    VARCHAR(50)  NULL COMMENT '작업자(주간)',
    worker_night  VARCHAR(50)  NULL COMMENT '작업자(야간)',
    qc_name       VARCHAR(50)  NULL COMMENT '공정QC 담당자',
    reg_user_id   VARCHAR(50)  NULL,
    reg_user_name VARCHAR(50)  NULL,
    reg_dt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (sheet_id),
    UNIQUE KEY uk_prod_check_sheet (equip_code, prod_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='열처리 CHECK SHEET';

-- 행 = 통 하나
CREATE TABLE IF NOT EXISTS prod_check_row (
    row_id        BIGINT        NOT NULL AUTO_INCREMENT,
    sheet_id      BIGINT        NOT NULL,
    row_no        INT           NOT NULL,
    out_time      VARCHAR(5)    NULL COMMENT '출로시간 HH:MM',
    vendor        VARCHAR(50)   NULL COMMENT '업체',
    part_no       VARCHAR(50)   NULL COMMENT '제품 품번',
    product_name  VARCHAR(100)  NULL COMMENT '품명',
    spec_text     VARCHAR(100)  NULL COMMENT '규격(치수)',
    lot_no        VARCHAR(30)   NULL COMMENT '작지 No(LOT)',
    qty_kg        DECIMAL(10,1) NULL COMMENT '생산량(Kg)',
    defect_qty    DECIMAL(10,1) NULL COMMENT '불량 수량',
    defect_code   VARCHAR(10)   NULL COMMENT '불량 구분',
    down_code     VARCHAR(20)   NULL COMMENT '비가동 표기(코드)',
    down_start    VARCHAR(5)    NULL COMMENT '비가동 시작 HH:MM',
    down_end      VARCHAR(5)    NULL COMMENT '비가동 끝 HH:MM',
    material      VARCHAR(50)   NULL COMMENT '재질',
    heat_lot_no   VARCHAR(20)   NULL COMMENT '열처리 LOT NO',
    worker        VARCHAR(50)   NULL,
    leader        VARCHAR(50)   NULL COMMENT '조장',
    qc            VARCHAR(50)   NULL COMMENT '공정QC',
    downtime_id   BIGINT        NULL COMMENT '연동된 설비비가동 기록',
    nc_id         BIGINT        NULL COMMENT '연동된 부적합품',
    reg_dt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    upd_dt        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (row_id),
    KEY idx_prod_check_row_sheet (sheet_id, row_no),
    CONSTRAINT fk_prod_check_row_sheet FOREIGN KEY (sheet_id) REFERENCES prod_check_sheet (sheet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='열처리 CHECK SHEET 행(통)';

-- 결재·확인·협조 서명 (담당/검토/승인/확인/설비관리/품질관리/품질보증/생산관리)
CREATE TABLE IF NOT EXISTS prod_check_sign (
    sheet_id   BIGINT       NOT NULL,
    slot       VARCHAR(20)  NOT NULL,
    user_id    VARCHAR(50)  NULL,
    sign_name  VARCHAR(50)  NOT NULL,
    sign_img   MEDIUMTEXT   NULL COMMENT '서명 이미지(PNG data URL) — 없으면 이름만',
    sign_dt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sheet_id, slot),
    CONSTRAINT fk_prod_check_sign_sheet FOREIGN KEY (sheet_id) REFERENCES prod_check_sheet (sheet_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='열처리 CHECK SHEET 서명';

-- 양식 설정(특기사항, 제목 아래 문구)
CREATE TABLE IF NOT EXISTS prod_check_setting (
    setting_key   VARCHAR(50) NOT NULL,
    setting_value TEXT        NULL,
    upd_dt        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='열처리 CHECK SHEET 양식 설정';

-- 비가동 코드(현장 CHECK SHEET 코드표 그대로) — 이미 있는 코드는 그룹만 채운다
INSERT INTO base_downtime_reason (reason_code, reason_name, reason_type, reason_group, sort_order, use_yn, remark, reg_user_name, upd_user_name) VALUES
('AF', '설비변성로', '고장정지', '설비문제(기계)', 101, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('AG', '설비공급장치', '고장정지', '설비문제(기계)', 102, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('AH', '설비전세정기', '고장정지', '설비문제(기계)', 103, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('AI', '설비가열로', '고장정지', '설비문제(기계)', 104, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('AJ', '설비유조', '고장정지', '설비문제(기계)', 105, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('AK', '설비후세정기', '고장정지', '설비문제(기계)', 106, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('AL', '설비소려로', '고장정지', '설비문제(기계)', 107, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('A4', '기계기타', '고장정지', '설비문제(기계)', 108, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BD', '전기변형로', '고장정지', '설비문제(전기)', 201, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BE', '전기공급장치', '고장정지', '설비문제(전기)', 202, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BF', '전기전세정기', '고장정지', '설비문제(전기)', 203, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BG', '전기가열로', '고장정지', '설비문제(전기)', 204, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BH', '전기유조', '고장정지', '설비문제(전기)', 205, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BI', '전기후세정기', '고장정지', '설비문제(전기)', 206, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BJ', '전기소려로', '고장정지', '설비문제(전기)', 207, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BK', '전기판넬', '고장정지', '설비문제(전기)', 208, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('BN', '전기기타', '고장정지', '설비문제(전기)', 209, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FO', '설비정지(우발)', '고장정지', '설비문제(전기)', 210, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FF', '설비정지(보전)', '계획정지', '설비문제(전기)', 211, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FK', '사이띄기', '기타', '생산', 301, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FB', '기계청소', '계획정지', '생산', 302, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FI', '작업변경', '계획정지', '생산', 303, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FN', '인원대기(근태)', '대기', '생산', 304, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('DF', '소재대기', '대기', '생산관리', 401, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FQ', '계획정지(오더)', '계획정지', '영업부문', 501, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FH', '인원대기(미증원)', '대기', '공통문제', 601, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('EC', '개발품', '기타', '공통문제', 602, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FG', '조회', '계획정지', '공통문제', 603, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FJ', '품질이상', '기타', '공통문제', 604, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FP', '교육', '계획정지', '공통문제', 605, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('FL', '기타', '기타', '공통문제', 606, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('ZZ', '타부서지원중(생산)', '대기', '공통문제', 607, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('ZY', '타부서지원중(보전)', '대기', '공통문제', 608, 'Y', '', 'CHECK SHEET', 'CHECK SHEET'),
('ZQ', '타부서지원중(품질)', '대기', '공통문제', 609, 'Y', '', 'CHECK SHEET', 'CHECK SHEET')
ON DUPLICATE KEY UPDATE reason_group = VALUES(reason_group);

-- 불량 구분
INSERT IGNORE INTO quality_defect_type (defect_code, defect_name, sort_order) VALUES
('A', '경도불량', 1), ('B', '혼입', 2), ('C', '낙하품', 3), ('D', '상이품', 4), ('E', '찍힘', 5),
('F', '휨', 6), ('G', '잔존품', 7), ('H', '드릴 TEST', 8), ('J', '토오크', 9), ('K', '녹', 10);

-- 양식 설정
INSERT IGNORE INTO prod_check_setting (setting_key, setting_value) VALUES
('subtitle', 'BOLT / SCREW'),
('note', '※ 소입경도 검사기준 → SWCH45F: HRC 55이상, SCM435: HRC 50이상, 보론강: HRC 40이상, SUS660: HRC 50이상\n※ 소입경도 검사주기 → 각 설비별 1회/4hr\n※ LOT NO 부여방법: 동일제품 작업시 1LOT 단위로 부여한다.\n※ 소려경도가 내부관리 상한으로 벗어날시 재Tempering 실시하고, 하한으로 벗어날시 시험검사실에 검사를 의뢰한다.');

-- CHECK SHEET 작성·수정 기록 — 누가(계정·IP) 언제 어느 호기·통의 무엇을 바꿨는지. 시트·행이 지워져도 남도록 FK 없음
CREATE TABLE IF NOT EXISTS prod_check_audit (
    audit_id    BIGINT       NOT NULL AUTO_INCREMENT,
    sheet_id    BIGINT       NULL,
    equip_code  VARCHAR(20)  NOT NULL,
    prod_date   DATE         NOT NULL,
    row_id      BIGINT       NULL     COMMENT '행(통) — 머리·서명은 NULL',
    row_no      INT          NULL,
    part_no     VARCHAR(50)  NULL,
    target      VARCHAR(20)  NOT NULL COMMENT '통 / 경도 / 머리 / 서명',
    action      VARCHAR(20)  NOT NULL COMMENT '추가 / 입력 / 수정 / 삭제 / 서명 / 서명취소',
    changes     TEXT         NULL     COMMENT 'JSON [{"f":항목,"b":전,"a":후}]',
    user_id     VARCHAR(50)  NULL     COMMENT '로그인 계정',
    user_name   VARCHAR(50)  NULL,
    client_ip   VARCHAR(45)  NULL,
    reg_dt      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (audit_id),
    KEY idx_pca_date (prod_date, equip_code),
    KEY idx_pca_sheet (sheet_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='CHECK SHEET 작성·수정 기록';

-- 설비점검표 항목 범위 — 수치로 기록하면 범위 밖일 때 빨간색(하한·상한 중 하나만 있어도 됨)
ALTER TABLE condition_equip_check_item
    ADD COLUMN range_min DECIMAL(10,3) NULL COMMENT '범위 하한(수치 기록용)' AFTER cycle,
    ADD COLUMN range_max DECIMAL(10,3) NULL COMMENT '범위 상한(수치 기록용)' AFTER range_min;
