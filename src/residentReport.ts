export type Contact = {
  block: string;
  unit: string;
  name: string | null;
  intercom: string | null;
  membershipStatus: string | null;
  livesHere: string | null;
  email: string | null;
  contactNumber: string | null;
  paid: string | null;
  receiptNumbers: string;
  apartmentStatus: "Paid" | "Unpaid";
};
export type ResidentReport = {
  towerNumber: string;
  generatedAt: string;
  status: "unpaid" | "paid" | "all";
  apartments: number;
  contactApartments: number;
  contacts: Contact[];
};
export const residentColumns: {
  key: keyof Contact;
  label: string;
  width: number;
}[] = [
  { key: "block", label: "Block", width: 75 },
  { key: "unit", label: "Unit No", width: 100 },
  { key: "name", label: "Name", width: 260 },
  { key: "contactNumber", label: "Contact number", width: 175 },
  { key: "intercom", label: "Intercom", width: 110 },
  { key: "membershipStatus", label: "Membership Status", width: 175 },
  { key: "livesHere", label: "Lives Here", width: 105 },
  { key: "email", label: "Email id", width: 300 },
  { key: "apartmentStatus", label: "Apartment status", width: 150 },
];

export function residentColumnsForStatus(status: ResidentReport["status"]) {
  return status === "unpaid"
    ? residentColumns
    : [
        ...residentColumns,
        { key: "receiptNumbers" as const, label: "Receipt number", width: 170 },
      ];
}
