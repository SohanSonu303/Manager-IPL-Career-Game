import { HashRouter, Route, Routes } from 'react-router-dom'
import { Debug, Home, Settings } from '@/ui/pages'
import { Shell } from '@/ui/Shell'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="debug" element={<Debug />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
