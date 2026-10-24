import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { TodayPage } from '../features/today/TodayPage'
import { PlanPage } from '../features/plan/PlanPage'
import { TemplateEditorPage } from '../features/plan/TemplateEditorPage'
import { RecordsPage } from '../features/records/RecordsPage'
import { RecordDetailPage } from '../features/records/RecordDetailPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { ExerciseLibraryPage } from '../features/settings/ExerciseLibraryPage'
import { SessionPage } from '../features/session/SessionPage'
import { SummaryPage } from '../features/session/SummaryPage'
import { OnboardingPage } from '../features/onboarding/OnboardingPage'

// 统计页依赖图表库，单独懒加载，避免拖慢首屏
const StatsPage = lazy(() =>
  import('../features/stats/StatsPage').then((module) => ({ default: module.StatsPage })),
)

function PageFallback() {
  return <p className="py-16 text-center text-[13px] text-ink3">加载中…</p>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/welcome" element={<OnboardingPage />} />
      <Route path="/session/:id" element={<SessionPage />} />
      <Route path="/session/:id/summary" element={<SummaryPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/plan/templates/:id" element={<TemplateEditorPage />} />
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/records/:id" element={<RecordDetailPage />} />
        <Route
          path="/stats"
          element={
            <Suspense fallback={<PageFallback />}>
              <StatsPage />
            </Suspense>
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/exercises" element={<ExerciseLibraryPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
