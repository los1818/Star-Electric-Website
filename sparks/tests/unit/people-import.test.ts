import { describe, expect, it } from "vitest";
import { parsePeopleCsv, personFrom } from "@/lib/imports/people";

describe("people import", () => {
  it("reads a ServiceBox-style user list: roles, emails from user names, electricians", () => {
    const { people, errors } = parsePeopleCsv("Name,User Name,Role,Email\nPat Field,patf,Basic User,\nOla Office,olao,Office Admin,\nSam Desk,,Office,sam@example.com\n");
    expect(errors).toEqual([]);
    expect(people).toEqual([
      { name: "Pat Field", firstName: "Pat", lastName: "Field", email: "patf@starelectric.ca", role: "TECHNICIAN", electrician: true },
      { name: "Ola Office", firstName: "Ola", lastName: "Office", email: "olao@starelectric.ca", role: "ADMIN", electrician: false },
      { name: "Sam Desk", firstName: "Sam", lastName: "Desk", email: "sam@example.com", role: "OFFICE", electrician: false },
    ]);
  });

  it("explains rows it can't use, including duplicates", () => {
    const { people, errors } = parsePeopleCsv("Name,User Name,Role\nPat Field,patf,Basic User\nPat Again,patf,Basic User\nNo Login,,Basic User\nOdd Role,oddr,Wizard\n,x,Office\n");
    expect(people).toHaveLength(1);
    expect(errors).toEqual([
      "Row 3: patf@starelectric.ca is listed twice",
      "Row 4: No Login: needs a user name or a valid email",
      'Row 5: Odd Role: role "Wizard" isn\'t one of Administrator, Office or Basic User',
      "Row 6: Name is required",
    ]);
  });

  it("accepts the role codes the Add user form sends", () => {
    expect(personFrom({ name: "A B", email: "a@b.ca", role: "OFFICE", electrician: true })).toMatchObject({ role: "OFFICE", electrician: true });
  });
});
