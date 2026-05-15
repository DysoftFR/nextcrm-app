"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MultiSelect, MultiSelectOption } from "@/components/ui/multi-select";
import { ProcessingStatusBadge } from "./processing-status-badge";
import { getDocumentVersions } from "@/actions/documents/get-document-versions";
import { retryEnrichment } from "@/actions/documents/retry-enrichment";
import { listAccountStatuses } from "@/actions/crm/account-statuses/list-account-statuses";
import { listLeadStatuses } from "@/actions/crm/lead-statuses/list-lead-statuses";
import { updateDocumentStatusBindings } from "@/actions/documents/update-document-status-bindings";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import moment from "moment";
import { DocumentRow } from "../data/schema";

interface DocumentDetailPanelProps {
  document: DocumentRow | null;
  open: boolean;
  onClose: () => void;
}

export function DocumentDetailPanel({
  document,
  open,
  onClose,
}: DocumentDetailPanelProps) {
  const [versions, setVersions] = useState<
    { id: string; version: number; createdAt: Date | null; size: number | null; created_by: { name: string | null } | null }[]
  >([]);
  const router = useRouter();
  const session = useSession();
  // better-auth user.role may be a comma-list ("admin,user") on the session; treat string match as admin
  const isAdminUser =
    typeof (session.data?.user as { role?: string } | undefined)?.role === "string" &&
    ((session.data?.user as { role: string }).role).split(",").includes("admin");

  const [accountStatusOptions, setAccountStatusOptions] = useState<MultiSelectOption[]>([]);
  const [leadStatusOptions, setLeadStatusOptions] = useState<MultiSelectOption[]>([]);
  const [accountStatusIds, setAccountStatusIds] = useState<string[]>([]);
  const [leadStatusIds, setLeadStatusIds] = useState<string[]>([]);
  const [savingBindings, setSavingBindings] = useState(false);

  useEffect(() => {
    if (document?.id && open) {
      getDocumentVersions(document.id).then(setVersions).catch(() => {});
    }
  }, [document?.id, open]);

  useEffect(() => {
    if (!open) return;
    if (!isAdminUser) return;
    listAccountStatuses()
      .then((rows) =>
        setAccountStatusOptions(rows.map((r) => ({ value: r.id, label: r.name })))
      )
      .catch(() => {});
    listLeadStatuses()
      .then((rows) =>
        setLeadStatusOptions(rows.map((r) => ({ value: r.id, label: r.name })))
      )
      .catch(() => {});
  }, [open, isAdminUser]);

  useEffect(() => {
    if (!document) return;
    setAccountStatusIds(
      (document.account_status_bindings ?? []).map((b) => b.account_status_id)
    );
    setLeadStatusIds(
      (document.lead_status_bindings ?? []).map((b) => b.lead_status_id)
    );
  }, [document]);

  if (!document) return null;

  const handleSaveBindings = async () => {
    try {
      setSavingBindings(true);
      await updateDocumentStatusBindings({
        documentId: document.id,
        accountStatusIds,
        leadStatusIds,
      });
      toast.success("Status bindings updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update bindings");
    } finally {
      setSavingBindings(false);
    }
  };

  const handleRetry = async () => {
    try {
      await retryEnrichment(document.id);
      toast.success("Enrichment re-triggered");
      router.refresh();
    } catch {
      toast.error("Failed to retry enrichment");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{document.document_name}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Status */}
          <div className="flex items-center gap-2">
            <ProcessingStatusBadge status={document.processing_status} />
            {document.processing_status === "FAILED" && (
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            )}
          </div>

          {/* Summary */}
          {document.summary && (
            <div>
              <h4 className="text-sm font-medium mb-1">Summary</h4>
              <p className="text-sm text-muted-foreground">{document.summary}</p>
            </div>
          )}

          <Separator />

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Type</span>
              <div>
                <Badge variant="outline">{document.document_system_type ?? "OTHER"}</Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Version</span>
              <div>{document.version}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <div>{document.createdAt ? moment(document.createdAt).format("MMM D, YYYY") : "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Account</span>
              <div>{document.accounts?.[0]?.account?.name ?? "—"}</div>
            </div>
          </div>

          <Separator />

          {/* Status Bindings (admin only) */}
          {isAdminUser && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Status bindings</h4>
              <p className="text-xs text-muted-foreground">
                Document automatically appears on any account or lead currently in the selected status(es).
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium">Show on Accounts with status</label>
                <MultiSelect
                  options={accountStatusOptions}
                  value={accountStatusIds}
                  onChange={setAccountStatusIds}
                  placeholder="Select account statuses…"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium">Show on Leads with status</label>
                <MultiSelect
                  options={leadStatusOptions}
                  value={leadStatusIds}
                  onChange={setLeadStatusIds}
                  placeholder="Select lead statuses…"
                />
              </div>
              <Button
                onClick={handleSaveBindings}
                disabled={savingBindings}
                size="sm"
              >
                {savingBindings ? "Saving…" : "Save bindings"}
              </Button>
            </div>
          )}

          {isAdminUser && <Separator />}

          {/* Version History */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Version History</h4>
            </div>
            <div className="space-y-2">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between text-sm py-1"
                >
                  <div className="flex items-center gap-2">
                    {v.version === document.version && (
                      <Badge variant="default" className="text-xs">
                        Current
                      </Badge>
                    )}
                    <span>Version {v.version}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {v.createdAt ? moment(v.createdAt).format("MMM D, YYYY") : ""}{" "}
                    {v.created_by?.name ? `by ${v.created_by.name}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
