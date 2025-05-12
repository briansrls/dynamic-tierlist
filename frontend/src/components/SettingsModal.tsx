import React from 'react';
import { AppUser } from '../App';
import PluginApiSettings from './PluginApiSettings';
import '../App.css'; // For modal styling

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentUser }) => {
  if (!isOpen || !currentUser) {
    return null;
  }

  return (
    <div className="modal-overlay settings-modal-overlay"> {/* Optional specific class for overlay */}
      <div className="modal-content settings-modal-content"> {/* Optional specific class for content */}
        <div className="modal-header">
          <h2>Application Settings</h2>
          <button onClick={onClose} className="close-modal-button icon-button" title="Close settings">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20px" height="20px">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
        <PluginApiSettings currentUser={currentUser} />
        {/* Add other settings sections here in the future if needed */}
      </div>
    </div>
  );
};

export default SettingsModal; 