import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from './components/common/Layout';
import Dashboard from './pages/Dashboard';
import Watchlist from './pages/Watchlist';
import TokenDetail from './pages/TokenDetail';
import Screening from './pages/Screening';
import Settings from './pages/Settings';
import Alerts from './pages/Alerts';
import './App.css';

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="watchlist" element={<Watchlist />} />
            <Route path="token/:id" element={<TokenDetail />} />
            <Route path="screening" element={<Screening />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
}
