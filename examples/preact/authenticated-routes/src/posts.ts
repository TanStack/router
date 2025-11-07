import axios from 'redaxios'

export type InvoiceType = {
  id: number
  title: string
  body: string
}

export const fetchInvoices = async () => {
  console.info('Fetching invoices...')
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<Array<InvoiceType>>('https://jsonplaceholder.typicode.com/posts')
    .then((r) => r.data.slice(0, 10))
}

export const fetchInvoiceById = async (id: number) => {
  console.info(`Fetching invoice with id ${id}...`)
  await new Promise((r) => setTimeout(r, 500))
  return axios
    .get<InvoiceType>(`https://jsonplaceholder.typicode.com/posts/${id}`)
    .then((r) => r.data)
}
