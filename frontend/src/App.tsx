import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import CreateRoom from './pages/CreateRoom'
import JoinRoom from './pages/JoinRoom'
import RoomPage from './pages/RoomPage'
import SharePage from './pages/SharePage'
import ActivitiesPage from './pages/ActivitiesPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/create" element={<CreateRoom />} />
      <Route path="/join/:code" element={<JoinRoom />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="/share/:code" element={<SharePage />} />
      <Route path="/activities" element={<ActivitiesPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
