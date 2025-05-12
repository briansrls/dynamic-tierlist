import React, { useState } from 'react';
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

  if (!isOpen || !targetUser || !actingUserId) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numericScoreDelta = parseFloat(scoreDelta);
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