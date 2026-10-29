export function Toast({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div className="toast" role="status">
      {msg}
    </div>
  )
}
