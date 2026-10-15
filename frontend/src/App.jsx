import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Assistant from './pages/Assistant.jsx';
import Costs from './pages/Costs.jsx';
import Supply from './pages/Supply.jsx';
import Shops from './pages/Shops.jsx';
import SoldLog from './pages/SoldLog.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Assistant />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/supply" element={<Supply />} />
          <Route path="/shops" element={<Shops />} />
          <Route path="/sold-log" element={<SoldLog />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
