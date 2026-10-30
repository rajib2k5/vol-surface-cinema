/** The data notice under the player, one paragraph per line, textContent only. */
export function showNotice(host: HTMLElement, lines: readonly string[]): void {
  host.replaceChildren(
    ...lines.map((line) => {
      const p = document.createElement('p')
      p.textContent = line
      return p
    }),
  )
}
