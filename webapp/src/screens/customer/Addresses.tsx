// Saved addresses (Uy, Ofis, …). New ones are saved from the order wizard.
import { useT } from "../../i18n";
import { api } from "../../lib/api";
import { invalidate, useQuery } from "../../lib/query";
import { confirmDialog, haptic } from "../../lib/tg";
import type { AddressDTO } from "../../lib/types";
import { Icon } from "../../ui/Icon";
import { EmptyState, Row, RowGroup, SkeletonList } from "../../ui/kit";
import { Page } from "../../ui/layout";

export function Addresses() {
  const t = useT();
  const q = useQuery<AddressDTO[]>("addresses", () => api.get("/addresses"));
  async function remove(a: AddressDTO) {
    if (!(await confirmDialog(`${t("delete")}: ${a.label}?`))) return;
    haptic.tick();
    await api.del(`/addresses/${a.id}`);
    invalidate("addresses");
  }
  return (
    <Page title={t("my_addresses")}>
      {q.loading ? (
        <SkeletonList n={2} h="h-16" />
      ) : !q.data?.length ? (
        <EmptyState icon="pin" title={t("saved_addresses")} text={t("save_address_as")} />
      ) : (
        <RowGroup>
          {q.data.map((a) => (
            <Row
              key={a.id}
              icon={a.label === t("label_office") ? "building" : "home"}
              label={a.label}
              sub={a.address}
              right={
                <button aria-label={t("delete")} onClick={() => remove(a)} className="flex h-12 w-12 items-center justify-center text-danger">
                  <Icon name="trash" size={20} />
                </button>
              }
            />
          ))}
        </RowGroup>
      )}
    </Page>
  );
}
