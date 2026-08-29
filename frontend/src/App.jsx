import { Routes, Route } from 'react-router-dom';
import AgeSelect from './pages/AgeSelect';
import TopicSelect from './pages/TopicSelect';
import ChatScreen from './pages/ChatScreen';
import DoctorLogin from './pages/DoctorLogin';
import DoctorDashboard from './pages/DoctorDashboard';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  return (
    <Routes>
      {/* Patient */}
      <Route path="/start" element={<AgeSelect />} />
      <Route path="/topic" element={<TopicSelect />} />
      <Route path="/chat" element={<ChatScreen />} />

      {/* Doctor */}
      <Route path="/doctor" element={<DoctorLogin />} />
      <Route path="/doctor/dashboard" element={<DoctorDashboard />} />

      {/* Administrator */}
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}
