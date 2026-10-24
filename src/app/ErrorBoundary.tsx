export function ErrorBoundary({ error }: { error: unknown }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <p className="text-[17px] font-semibold text-ink">页面出了点问题</p>
      <p className="mt-2 max-w-[300px] text-[13px] leading-5 text-ink2">
        {error instanceof Error ? error.message : '未知错误'}
      </p>
      <button
        type="button"
        onClick={() => {
          window.location.href = '/'
        }}
        className="mt-6 h-11 rounded-btn bg-brand px-5 text-[14px] font-medium text-white"
      >
        返回首页
      </button>
    </div>
  )
}
