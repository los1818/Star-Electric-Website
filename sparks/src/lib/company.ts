/** Form field → CompanySetting key. Printed on quotes and invoices. */
export const COMPANY_FIELDS = {
  companyName: "company.name",
  companyStreet: "company.street",
  companyCity: "company.city",
  companyProvince: "company.province",
  companyPostal: "company.postal",
  companyPhone: "company.phone",
  companyEmail: "company.email",
  gstNumber: "company.gstNumber",
  pstNumber: "company.pstNumber",
  invoiceFooter: "invoice.footer",
} as const;

export type CompanyField = keyof typeof COMPANY_FIELDS;
