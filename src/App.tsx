import { HashRouter, Route, Routes } from 'react-router-dom'
import { Gallery } from '@/ui/Gallery'
import { Home } from '@/ui/Home'
import { MarketPage } from '@/ui/MarketPage'
import { MatchPage } from '@/ui/MatchPage'
import { Debug, Settings } from '@/ui/pages'
import { Shell } from '@/ui/Shell'
import { TablePage } from '@/ui/TablePage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="table" element={<TablePage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="match" element={<MatchPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="debug" element={<Debug />} />
          <Route path="gallery" element={<Gallery />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
