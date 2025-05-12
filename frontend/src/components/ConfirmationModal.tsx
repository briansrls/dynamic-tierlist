import React from 'react';
import '../App.css'; // Assuming common modal styles are here

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void; // Can also be onCancel
  onConfirm: () => void;
  title?: string;
  message: string | React.ReactNode;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmButtonText = "Confirm",
  cancelButtonText = "Cancel",
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content confirmation-modal-content"> {/* Optional specific class */}
        <h2>{title}</h2>
        <div className="confirmation-message">{message}</div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="button-secondary">
            {cancelButtonText}
          </button>
          <button type="button" onClick={onConfirm} className="button-danger"> {/* Or button-primary if not destructive */}
            {confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal; 