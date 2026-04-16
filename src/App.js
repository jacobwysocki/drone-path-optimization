import React from 'react';
import './App.css';
import Visualization3D from './visualization/Visualization3D';

function App() {
  return (
      <div className="App" style={{ margin: 0, padding: 0, height: '100vh', width: '100vw', overflow: 'hidden' }}>
        <Visualization3D />
      </div>
  );
}

export default App;
