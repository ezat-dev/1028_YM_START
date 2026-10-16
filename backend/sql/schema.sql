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
