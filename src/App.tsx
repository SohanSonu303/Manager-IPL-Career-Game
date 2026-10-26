import { HashRouter, Route, Routes } from 'react-router-dom'
import { AchievementsPage } from '@/ui/AchievementsPage'
import { AuctionPage } from '@/ui/AuctionPage'
import { ContractsPage } from '@/ui/ContractsPage'
import { DailyPage } from '@/ui/DailyPage'
import { Gallery } from '@/ui/Gallery'
import { Home } from '@/ui/Home'
import { LineupPage } from '@/ui/LineupPage'
import { MarketPage } from '@/ui/MarketPage'
import { MatchPage } from '@/ui/MatchPage'
import { NewsPage } from '@/ui/NewsPage'
import { Debug, Settings } from '@/ui/pages'
import { PreMatchPage } from '@/ui/PreMatchPage'
import { Shell } from '@/ui/Shell'
import { SquadPage } from '@/ui/SquadPage'
import { StatsPage } from '@/ui/StatsPage'
import { FixturesPage, TablePage } from '@/ui/TablePage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="squad" element={<SquadPage />} />
          <Route path="lineup" element={<LineupPage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="auction" element={<AuctionPage />} />
          <Route path="table" element={<TablePage />} />
          <Route path="fixtures" element={<FixturesPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="news" element={<NewsPage />} />
          <Route path="prematch" element={<PreMatchPage />} />
          <Route path="match" element={<MatchPage />} />
          <Route path="daily" element={<DailyPage />} />
          <Route path="achievements" element={<AchievementsPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="debug" element={<Debug />} />
          <Route path="gallery" element={<Gallery />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
