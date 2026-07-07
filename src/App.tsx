/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './components/AuthContext';
import { Layout } from './components/Layout';
import StylingPage from './pages/StylingPage';
import WardrobePage from './pages/WardrobePage';
import CalendarPage from './pages/CalendarPage';
import ProfilePage from './pages/ProfilePage';
import MiniMePage from './pages/MiniMePage';
import OutfitPickerPage from './pages/OutfitPickerPage';
import LinkDevicePage from './pages/LinkDevicePage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<StylingPage />} />
            <Route path="wardrobe" element={<WardrobePage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="model" element={<MiniMePage />} />
            <Route path="picker" element={<OutfitPickerPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="link" element={<LinkDevicePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
