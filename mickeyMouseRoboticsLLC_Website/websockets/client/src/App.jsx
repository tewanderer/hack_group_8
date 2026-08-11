import { useState } from 'react';
import Home from './pages/Home.jsx';
import Visualizer from './pages/Visualizer.jsx';
import './App.css';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'visualizer', label: 'Visualizer' },
];

function App() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <div className="site">
      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'tab active' : 'tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        {/* Conditional rendering (not just CSS hiding) means Visualizer
            unmounts when you leave it -- its WebSocket effect cleanup runs
            and closes the connection, same as with the router version. */}
        {activeTab === 'home' && <Home />}
        {activeTab === 'visualizer' && <Visualizer />}
      </main>
    </div>
  );
}

export default App;