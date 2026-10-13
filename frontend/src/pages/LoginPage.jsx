import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconLock, IconUser, IconHexagon, IconShieldCheck, IconEye, IconEyeOff, IconAlertTriangle } from '@tabler/icons-react';
import { useAuth } from '../context/AuthContext';
import { login as loginApi } from '../api/authClient';
import LoginNetworkDiagram from '../components/LoginNetworkDiagram';
import './LoginPage.css';

export default function LoginPage() {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  // Caps Lock 상태는 키 이벤트에서만 읽을 수 있어서, 비밀번호 칸에서 키를 누르거나 뗄 때마다 갱신한다.
  const updateCapsLock = (e) => setCapsLockOn(e.getModifierState?.('CapsLock') ?? false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginId.trim() || !password.trim()) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await loginApi(loginId.trim(), password);
      login(res.data, remember);
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message ?? '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {/* 좌측 브랜드 패널 — 회사 로고/사진 전달되면 이 영역만 교체 */}
        <div className="login-brand">
          <div className="login-brand-top">
            <div className="login-logo-slot">
              <IconHexagon size={22} />
            </div>
            <span className="login-brand-name">SMART MES</span>
          </div>

          <div className="login-brand-middle">
            <LoginNetworkDiagram />
          </div>

          <div className="login-brand-bottom">© 2026 회사명이 들어갈 자리. All rights reserved.</div>
        </div>

        {/* 우측 로그인 폼 */}
        <div className="login-form-panel">
          <div className="login-form-box">
            <div className="login-mobile-brand">
              <div className="login-logo-slot" style={{ borderColor: 'var(--mes-border)', color: 'var(--mes-accent)' }}>
                <IconHexagon size={20} />
              </div>
              <span style={{ fontWeight: 700, color: 'var(--mes-text)' }}>SMART MES</span>
            </div>

            <span className="login-form-badge">사용자 로그인</span>
            <h2 className="login-form-title">로그인</h2>
            <p className="login-form-desc">
              등록된 계정으로 로그인 후 시스템에 접속하세요.
              <br />
              권한에 따라 메뉴와 기능이 자동으로 적용됩니다.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <label className="login-field-label">아이디</label>
                <div className="login-field-control">
                  <IconUser size={16} />
                  <input
                    placeholder="아이디를 입력하세요"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    autoFocus
                    autoComplete="username"
                  />
                </div>
              </div>
              <div className="login-field">
                <label className="login-field-label">비밀번호</label>
                <div className="login-field-control has-toggle">
                  <IconLock size={16} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="비밀번호를 입력하세요"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={updateCapsLock}
                    onKeyUp={updateCapsLock}
                    onBlur={() => setCapsLockOn(false)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                    aria-pressed={showPassword}
                    title={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showPassword ? <IconEyeOff size={17} /> : <IconEye size={17} />}
                  </button>
                </div>
                {capsLockOn && (
                  <div className="login-capslock" role="status">
                    <IconAlertTriangle size={14} />
                    Caps Lock이 켜져 있습니다.
                  </div>
                )}
              </div>

              <label className="login-remember">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                로그인 상태 유지
              </label>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="login-submit" disabled={submitting}>
                {submitting ? '로그인 중...' : 'MES 로그인'}
              </button>
            </form>

            <div className="login-security-notice">
              <IconShieldCheck size={18} />
              <div>
                <div className="login-security-notice-title">보안 안내</div>
                <div className="login-security-notice-desc">
                  인증된 사용자만 접근할 수 있으며 로그인 기록이 자동으로 저장됩니다. 로그인 실패가 반복되면 시스템관리팀에 문의하세요.
                </div>
              </div>
            </div>

            <div className="login-footer">
              <span>문의: 시스템관리팀 · 사내 폐쇄망 전용</span>
              <span className="login-footer-tag">Confidential</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
