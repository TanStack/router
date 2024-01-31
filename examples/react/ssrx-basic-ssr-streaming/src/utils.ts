export const sleep = (n = 750) => new Promise((r) => setTimeout(r, n))

export const rand = () => Math.round(Math.random() * 100)

const memberData = [
  { id: 1, name: 'marc' },
  { id: 2, name: 'john' },
  { id: 3, name: 'emily' },
  { id: 4, name: 'bob' },
]

export const getMembers = () => {
  return memberData
}

export const getMember = (id: number) => {
  return memberData.find((m) => m.id === id)
}
