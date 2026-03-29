import { CrmPage } from '@/app/ui/shell/crm-page';

type CommunicationEmailEditPageProps = {
  params: {
    id: string;
  };
};

export default function CommunicationEmailEditPage({ params }: CommunicationEmailEditPageProps) {
  return <CrmPage section="communication" communicationView="emails-edit" communicationRecordId={params.id} />;
}
