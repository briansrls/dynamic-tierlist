import React, { useState, useEffect, useCallback } from 'react';
import { AppUser } from '../App'; // Assuming AppUser is exported from App.tsx
import ConfirmationModal from './ConfirmationModal'; // Import ConfirmationModal
import '../App.css'; // For styles

interface PluginApiKeyStatus {
  has_api_key: boolean;
  generated_at?: string; // ISO datetime string
}

interface PluginApiSettingsProps {
  currentUser: AppUser | null;
}

const PluginApiSettings: React.FC<PluginApiSettingsProps> = ({ currentUser }) => {
  const [apiKeyStatus, setApiKeyStatus] = useState<PluginApiKeyStatus | null>(null);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // State for confirmation modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState<string | React.ReactNode>('');
  const [confirmButtonText, setConfirmButtonText] = useState("Confirm");

  const fetchApiKeyStatus = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setFeedbackMessage(null); // Clear previous feedback
    const token = localStorage.getItem('app_access_token');
    if (!token) {
      setFeedbackMessage({ type: 'error', text: "Authentication required." });
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/users/me/plugin-api-key-status', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Failed to fetch API key status" }));
        throw new Error(errData.detail || `Error: ${response.status}`);
      }
      const data: PluginApiKeyStatus = await response.json();
      setApiKeyStatus(data);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
      setApiKeyStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchApiKeyStatus();
  }, [fetchApiKeyStatus]);

  const openConfirmationModal = (action: () => Promise<void>, message: string | React.ReactNode, buttonText: string) => {
    setConfirmAction(() => action); // Store the function itself
    setConfirmMessage(message);
    setConfirmButtonText(buttonText);
    setIsConfirmModalOpen(true);
  };

  const handleRunConfirmedAction = async () => {
    if (confirmAction) {
      await confirmAction();
    }
    setIsConfirmModalOpen(false);
    setConfirmAction(null);
  };

  const doGenerateKey = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setFeedbackMessage(null);
    setNewlyGeneratedKey(null);
    const token = localStorage.getItem('app_access_token');
    if (!token) {
      setFeedbackMessage({ type: 'error', text: "Authentication required." });
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/users/me/plugin-api-key', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Failed to generate API key" }));
        throw new Error(errData.detail || `Error: ${response.status}`);
      }
      const data: { api_key: string, generated_at: string } = await response.json();
      console.log("Frontend: Received data from /users/me/plugin-api-key:", data); // LOG 1: Full response data

      if (data && data.api_key) {
        setNewlyGeneratedKey(data.api_key);
        console.log("Frontend: Set newlyGeneratedKey to:", data.api_key); // LOG 2: Key being set
        setFeedbackMessage({ type: 'success', text: "API Key generated successfully!" });
        console.log("Frontend: Set feedbackMessage to success."); // LOG 3: Feedback message
      } else {
        console.error("Frontend: API key missing in response data:", data);
        throw new Error("API key was not found in the server response.");
      }
      fetchApiKeyStatus(); // Refresh status (key preview, etc.)
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateKey = () => {
    openConfirmationModal(
      doGenerateKey,
      "Generating a new API key will invalidate any existing key. Are you sure you want to continue?",
      apiKeyStatus?.has_api_key ? "Regenerate" : "Generate"
    );
  };

  const doRevokeKey = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setFeedbackMessage(null);
    const token = localStorage.getItem('app_access_token');
    if (!token) {
      setFeedbackMessage({ type: 'error', text: "Authentication required." });
      setIsLoading(false);
      return;
    }
    try {
      const response = await fetch('http://localhost:8000/users/me/plugin-api-key', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 204) {
        const errData = await response.json().catch(() => ({ detail: "Failed to revoke API key" }));
        throw new Error(errData.detail || `Error: ${response.status}`);
      }
      setNewlyGeneratedKey(null);
      setFeedbackMessage({ type: 'success', text: "Plugin API Key revoked successfully." });
      fetchApiKeyStatus();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeKey = () => {
    openConfirmationModal(
      doRevokeKey,
      "Are you sure you want to revoke your Plugin API Key? This action cannot be undone.",
      "Revoke"
    );
  };

  const handleCopyToClipboard = () => {
    if (newlyGeneratedKey) {
      navigator.clipboard.writeText(newlyGeneratedKey)
        .then(() => setFeedbackMessage({ type: 'success', text: "API Key copied to clipboard!" }))
        .catch(err => {
          console.error("Failed to copy API key: ", err);
          setFeedbackMessage({ type: 'error', text: "Failed to copy. Please copy manually." });
        });
    }
  };

  if (!currentUser) return <p>Please log in to manage Plugin API Key.</p>;

  return (
    <div className="plugin-api-settings-container">
      <h4>Plugin API Key Management</h4>
      {isLoading && <p>Loading status...</p>}
      {feedbackMessage && (
        <p className={feedbackMessage.type === 'error' ? 'error-message' : 'success-message'}>
          {feedbackMessage.text}
        </p>
      )}
      {apiKeyStatus && (
        <div className="api-key-status">
          {apiKeyStatus.has_api_key ? (
            <>
              <p>API Key Generated: {new Date(apiKeyStatus.generated_at!).toLocaleString()}</p>
              <button onClick={handleRevokeKey} className="button-danger" disabled={isLoading}>
                Revoke Key
              </button>
            </>
          ) : (
            <p>No Plugin API Key has been generated yet.</p>
          )}
          <button onClick={handleGenerateKey} className="button-primary" disabled={isLoading} style={{ marginLeft: apiKeyStatus.has_api_key ? '10px' : '0' }}>
            {apiKeyStatus.has_api_key ? "Regenerate Key" : "Generate Key"}
          </button>
        </div>
      )}
      {newlyGeneratedKey && (
        <div className="new-api-key-display">
          <p><strong>Your new API Key (copy this now, it won't be shown again):</strong></p>
          <code>{newlyGeneratedKey}</code>
          <button onClick={handleCopyToClipboard} style={{ marginLeft: '10px' }}>Copy</button>
        </div>
      )}
      <div className="plugin-instructions">
        <p style={{ marginTop: '15px', fontSize: '0.9em', color: '#b9bbbe' }}>
          To use the BetterDiscord plugin for rating, you will need to configure it with your User ID and this API key.<br />
          Your User ID: <code>{currentUser.user_id}</code> (Click to copy)
          {/* TODO: Add copy functionality for User ID */}
        </p>
      </div>
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => { setIsConfirmModalOpen(false); setConfirmAction(null); }}
        onConfirm={handleRunConfirmedAction}
        title={apiKeyStatus?.has_api_key && confirmAction === doGenerateKey ? "Regenerate API Key?" : "Confirm Action"} // Dynamic title
        message={confirmMessage}
        confirmButtonText={confirmButtonText}
      />
    </div>
  );
};

export default PluginApiSettings; 