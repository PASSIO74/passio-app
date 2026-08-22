// SENTINEL PROMOTION ROUTES — surface HTTP strictement lecture seule.
import { promotionStatusView } from "./sentinel-promotion-view.js";

export function registerPromotionReadRoutes(api, auth) {
  api.get("/sentinel/promotions", auth.requireAuth, (req, res) => {
    res.json(promotionStatusView(Number(req.query.limit) || 20));
  });
}

export const PROMOTION_READ_ROUTE = Object.freeze({
  method: "GET",
  path: "/sentinel/promotions",
  authenticated: true,
  mutation: false,
  productionDeploy: false,
});
