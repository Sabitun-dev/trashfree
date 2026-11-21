import { useT } from "../../i18n";
import { EmptyState } from "../../ui/kit";
import { Page } from "../../ui/layout";

/** Placeholder for screens built in a later phase. */
export function Soon() {
  const t = useT();
  return (
    <Page hasTabBar>
      <EmptyState icon="hourglass" title={t("loading")} />
    </Page>
  );
}
