"use client";

import { columns } from "@/app/[locale]/(routes)/documents/components/columns";
import { DocumentsDataTable } from "@/app/[locale]/(routes)/documents/components/data-table";
import { BulkUploadModal } from "@/app/[locale]/(routes)/documents/components/bulk-upload-modal";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

interface DocumentsViewProps {
  data: any;
  accountId?: string;
  title?: string;
  readOnly?: boolean;
  emptyMessage?: string;
}

const DocumentsView = ({
  data,
  accountId,
  title = "Documents",
  readOnly = false,
  emptyMessage = "No assigned documents found",
}: DocumentsViewProps) => {
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between">
          <div>
            <CardTitle
              onClick={() => router.push("/documents")}
              className="cursor-pointer"
            >
              {title}
            </CardTitle>
            <CardDescription></CardDescription>
          </div>
          <div className="flex space-x-2">
            {!readOnly && accountId && <BulkUploadModal accountId={accountId} />}
          </div>
        </div>
        <Separator />
      </CardHeader>
      <CardContent>
        {!data || data.length === 0 ? (
          emptyMessage
        ) : (
          <DocumentsDataTable data={data} columns={columns} readOnly={readOnly} />
        )}
      </CardContent>
    </Card>
  );
};

export default DocumentsView;
