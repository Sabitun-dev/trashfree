// "Yana buyurtma": copy an old order into a fresh draft; the customer only picks a new day and time.
import { emptyDraft, replaceDraft } from "../../lib/draft";
import type { OrderDTO } from "../../lib/types";

export function prefillFromOrder(o: OrderDTO & { trashTypeCode: string; packageSizeCode: string }, keepWhen = false) {
  replaceDraft({
    ...emptyDraft(),
    lat: o.lat,
    lng: o.lng,
    address: o.address,
    notes: o.notes ?? "",
    trashType: o.trashTypeCode,
    packageSize: o.packageSizeCode,
    quantity: o.quantity,
    method: o.paymentMethod,
    date: keepWhen ? o.pickupDate : null,
    slotId: keepWhen ? o.slotId : null,
    repeat: true,
  });
}

/** Codes are needed for the draft; the catalog maps ids to codes. */
export function withCodes(o: OrderDTO, catalog: { trashTypes: { id: number; code: string }[]; packageSizes: { id: number; code: string }[] }) {
  return {
    ...o,
    trashTypeCode: catalog.trashTypes.find((x) => x.id === o.trashTypeId)?.code ?? "",
    packageSizeCode: catalog.packageSizes.find((x) => x.id === o.packageSizeId)?.code ?? "",
  };
}
