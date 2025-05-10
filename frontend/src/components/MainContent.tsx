import React from 'react';
import ScoreGraph from './ScoreGraph';

const MainContent: React.FC = () => {
  return (
    <div className="main-content-container">
      <ScoreGraph />
      {/* Other content for the main area can go here in the future */}
    </div>
  );
};

export default MainContent; 