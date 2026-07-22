import { Link } from '@tanstack/react-router'
import type { ItemScreenProps } from './ItemScreen'
import type { ElementType } from 'react'

const NativeButton = 'button' as ElementType<{
  text: string
  onTap: () => void
  style?: Record<string, unknown>
}>

export function ItemScreen({
  item,
  backProtected,
  onBackProtectedChange,
}: ItemScreenProps) {
  return (
    <stacklayout style={{ padding: 24 }}>
      <label style={{ color: '#2563eb', fontWeight: '700' }}>
        PATH PARAM + NATIVE STACK
      </label>
      <label style={{ fontSize: 32, fontWeight: '700', marginTop: 12 }}>
        {item.name}
      </label>
      <label style={{ fontSize: 17, marginTop: 16 }}>{item.description}</label>
      {backProtected ? (
        <label style={{ color: '#b91c1c', marginTop: 16 }}>
          Back protected
        </label>
      ) : null}
      <NativeButton
        text={backProtected ? 'Allow back' : 'Protect back'}
        onTap={() => onBackProtectedChange(!backProtected)}
        style={{ marginTop: 20 }}
      />
      <Link
        to="/search"
        search={{ q: item.name }}
        style={{ marginTop: 28, padding: 16, backgroundColor: '#dbeafe' }}
      >
        Search this topic
      </Link>
    </stacklayout>
  )
}
