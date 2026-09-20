import { ServiceType } from '../reservation/status';
import { SupplierCategory } from '../supplier/compliance';

/**
 * Which supplier categories can fulfil each service type. Used to pick
 * dispatch candidates for a service item.
 */
export const SERVICE_TYPE_TO_SUPPLIER_CATEGORIES: Readonly<
  Record<ServiceType, readonly SupplierCategory[]>
> = {
  [ServiceType.Guide]: [SupplierCategory.TourGuide],
  [ServiceType.Transportation]: [SupplierCategory.PrivateDriver],
  [ServiceType.Accommodation]: [SupplierCategory.HomestayHost],
  [ServiceType.Experience]: [SupplierCategory.TourGuide, SupplierCategory.Translator],
};
