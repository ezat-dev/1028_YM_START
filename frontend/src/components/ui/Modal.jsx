export default function Modal({ title, onClose, children, footer, large, xl, className }) {
  const sizeClass = xl ? 'mes-modal-xl' : large ? 'mes-modal-lg' : '';
  return (
    // 바깥(어두운 영역)을 눌러도 닫히지 않는다 — 입력하다 실수로 바깥을 눌러 내용이 날아가는 일을 막기 위해.
    // 닫기는 ✕ 버튼이나 각 화면의 취소/닫기 버튼으로만.
    <div className="mes-modal-overlay">
      <div className={`mes-modal ${sizeClass} ${className || ''}`.trim().replace(/\s+/g, ' ')}>
        <div className="mes-modal-header">
          <h3>{title}</h3>
          <button type="button" className="mes-btn mes-btn-ghost" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="mes-modal-body">{children}</div>
        {footer && <div className="mes-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
