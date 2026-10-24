import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { cx } from '../lib/cx'
import {
  CalendarIcon,
  ChartIcon,
  HomeIcon,
  ListIcon,
  SettingsIcon,
} from '../components/icons'

const NAV = [
  { to: '/', label: '今日', icon: HomeIcon, end: true },
  { to: '/plan', label: '计划', icon: CalendarIcon, end: false },
  { to: '/records', label: '记录', icon: ListIcon, end: false },
  { to: '/stats', label: '统计', icon: ChartIcon, end: false },
  { to: '/settings', label: '设置', icon: SettingsIcon, end: false },
]

export function AppLayout() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [])

  if (settings === undefined) {
    return <div className="min-h-screen bg-white" aria-busy="true" />
  }
  if (!settings.onboardingDone) {
    return <Navigate to="/welcome" replace />
  }

  return (
    <div className="min-h-full bg-white">
      {/* 桌面端侧边导航 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col border-r border-line bg-white px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-brand text-white">
            <span className="text-[15px] font-bold">练</span>
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight text-ink">今天练了吗</div>
            <div className="text-[11px] text-ink3">Keep it simple</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1" aria-label="主导航">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex h-11 items-center gap-3 rounded-btn px-3 text-[14px] transition-colors',
                  isActive
                    ? 'bg-brandsoft font-medium text-brand'
                    : 'text-ink2 active:bg-soft',
                )
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-3 text-[11px] leading-5 text-ink3">
          数据仅保存在本机
          <br />
          记得定期导出备份
        </div>
      </aside>

      {/* 内容区 */}
      <main className="safe-top pb-24 lg:pb-10 lg:pl-[220px]">
        <div className="mx-auto w-full max-w-[560px] px-4 pt-3 lg:max-w-[960px] lg:px-8 lg:pt-8">
          <Outlet />
        </div>
      </main>

      {/* 手机端底部导航 */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden"
        aria-label="主导航"
      >
        <div className="mx-auto flex max-w-[560px] items-stretch justify-around px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px]',
                  isActive ? 'font-medium text-brand' : 'text-ink3',
                )
              }
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
