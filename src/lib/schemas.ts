import { z } from "zod";

const conditionEnum = z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]);

export const sellerValuationSchema = z.object({
  specsText: z.string().trim().min(2, "specsText는 2자 이상이어야 합니다."),
  condition: conditionEnum.optional(),
  monthsUsed: z.number().int().min(0).max(240).optional(),
  askingPriceKrw: z.number().int().min(0).max(500000000).optional(),
  hasWarranty: z.boolean().optional(),
});

export const buyerValuationSchema = z.object({
  sourceUrl: z.string().url().optional().or(z.literal("")),
  bodyText: z.string().trim().min(2, "bodyText는 2자 이상이어야 합니다."),
  askingPriceKrw: z.number().int().min(0).max(500000000).optional(),
});

export const partValuationSchema = z.object({
  modelName: z.string().trim().min(2, "modelName은 2자 이상이어야 합니다."),
  condition: conditionEnum.optional(),
  monthsUsed: z.number().int().min(0).max(240).optional(),
});

export type SellerValuationInput = z.infer<typeof sellerValuationSchema>;
export type BuyerValuationInput = z.infer<typeof buyerValuationSchema>;
export type PartValuationInput = z.infer<typeof partValuationSchema>;
