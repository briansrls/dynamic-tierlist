import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from './UserSearch'; // Assuming UserProfile is exported here
import '../App.css'; // For modal styling

interface AddRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: UserProfile | null;
  onSubmitRating: (scoreDelta: number, reason: string) => void;
  actingUserId: string | null; // ID of the user giving the rating
}

const AddRatingModal: React.FC<AddRatingModalProps> = ({ isOpen, onClose, targetUser, onSubmitRating, actingUserId }) => {
  const [scoreDelta, setScoreDelta] = useState<string>(''); // Store as string to allow +/- and easier input
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scoreInputRef = useRef<HTMLInputElement>(null); // Create a ref for the score input

  // Effect to focus the score input when the modal opens
  useEffect(() => {
    if (isOpen && scoreInputRef.current) {
      // Slight delay to ensure the input is rendered and focusable, especially if there are open animations
      const timer = setTimeout(() => {
        scoreInputRef.current?.focus();
      }, 100); // Adjust delay if needed, 0 might work too sometimes
      return () => clearTimeout(timer);
    }
  }, [isOpen]); // Dependency: run when isOpen changes

  // Clear form when modal is closed or targetUser changes (if modal re-used for different users without closing)
  useEffect(() => {
    if (!isOpen) {
      setScoreDelta('');
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !targetUser || !actingUserId) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Remove commas before parsing
    const cleanedScoreDeltaString = scoreDelta.replace(/,/g, '');
    const numericScoreDelta = parseFloat(cleanedScoreDeltaString);

    if (isNaN(numericScoreDelta)) {
      setError('Score delta must be a valid number.');
      return;
    }

    if (numericScoreDelta === 0) {
      setError('Score delta cannot be zero.');
      return;
    }

    // Call the passed onSubmitRating, which will handle the API call
    try {
      await onSubmitRating(numericScoreDelta, reason);
      // Clear form and close modal on successful submission (handled by parent)
      setScoreDelta('');
      setReason('');
      // onClose(); // Parent will call onClose on successful API submission
    } catch (apiError: any) {
      setError(apiError.message || 'Failed to submit rating.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Rate {targetUser.username}#{targetUser.discriminator}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="scoreDelta">Score Change (+/-):</label>
            <input
              ref={scoreInputRef} // Attach the ref to the input element
              type="text" // Changed to text to easily allow +/- prefixes
              id="scoreDelta"
              value={scoreDelta}
              onChange={(e) => setScoreDelta(e.target.value)}
              placeholder="e.g., +5, -10"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="reason">Reason (Optional):</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="submit" className="button-primary">Submit Rating</button>
            <button type="button" onClick={onClose} className="button-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddRatingModal; 