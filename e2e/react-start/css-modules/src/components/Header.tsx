import styles from './Header.module.css'

export function Header({ title }: { title: string }) {
  return (
    <header className={styles.header} data-testid="shared-header">
      <h1>{title}</h1>
      <button type="button">Save</button>
    </header>
  )
}
