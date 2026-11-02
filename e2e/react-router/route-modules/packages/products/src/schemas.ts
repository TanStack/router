import { z } from 'zod'

/** Search params of the product page: `tab` is optional when navigating. */
export const productSearchSchema = z.object({
  tab: z.enum(['specs', 'reviews']).default('specs'),
})
