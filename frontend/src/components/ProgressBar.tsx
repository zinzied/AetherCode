import React from 'react';

interface ProgressBarProps {
  progress: number;
  status: string;
  message: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, status, message }) => {
  return (
    <div className="progress-container" style={{ marginTop: '1rem' }}>
      <div className="progress-bar" style={{
        width: '100%',
        height: '20px',
        backgroundColor: '#f0f0f0',
        borderRadius: '10px',
        overflow: 'hidden'
      }}>
        <div className="progress-fill" style={{
          width: `${Math.min(100, progress)}%`,
          height: '100%',
          backgroundColor: status === 'error' ? '#ff4444' : '#4CAF50',
          transition: 'width 0.3s ease-in-out'
        }} />
      </div>
      <div className="progress-text" style={{
        marginTop: '0.5rem',
        textAlign: 'center',
        color: status === 'error' ? '#ff4444' : '#333'
      }}>
        {message}
      </div>
    </div>
  );
};

export default ProgressBar;
