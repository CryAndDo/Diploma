import './SuccessModal.scss';

export default function SuccessModal({ message, onClose }) {
  return (
    <div className="modal-backdrop">
      <div className="modal-window">
        <h3>✅ Успешно</h3>
        <p>{message}</p>
        <button className="btn btn-primary" onClick={onClose}>
          ОК
        </button>
      </div>
    </div>
  );
}
