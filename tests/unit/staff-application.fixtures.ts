import type { StaffApplicationData } from "@/lib/schemas/staff-application";

export const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

/** A complete, valid application. Names, contacts and employers are placeholders. */
export function validApplication(): Required<StaffApplicationData> {
  return {
    personal: {
      title: "Ms",
      fullName: "Test Applicant",
      dob: "1988-04-12",
      gender: "FEMALE",
      nationality: "Indian",
      email: "Test.Applicant@example.com",
      phone: "+91 98765 43210",
      address: "12 Placeholder Lane, Sample City 000000",
      noticeOrAvailability: "",
    },
    family: {
      maritalStatus: "",
      children: [],
      emergencyName: "Sample Contact",
      emergencyRelation: "Sister",
      emergencyPhone: "+91 98765 43211",
    },
    education: {
      items: [
        {
          qualification: "B.Ed",
          institution: "Sample University",
          year: 2010,
          grade: "First",
          certificateKey: "",
        },
      ],
    },
    current: {
      employed: true,
      employer: "Sample School",
      role: "Teacher of English",
      since: "2019-06",
      noticePeriod: "Two months",
      reasonForLeaving: "",
    },
    history: {
      items: [
        {
          employer: "Earlier School",
          role: "Assistant teacher",
          from: "2012-06",
          to: "2019-05",
          reasonForLeaving: "",
        },
      ],
    },
    interests: { subjects: ["English"], phases: ["Middle School (Years 7–9)"], interests: "" },
    statement: { text: words(200) },
    references: {
      items: [
        {
          name: "Head Teacher",
          role: "Principal",
          organisation: "Sample School",
          email: "head@example.com",
          phone: "",
          relationship: "Line manager",
          isCurrentEmployer: true,
        },
        {
          name: "Former Colleague",
          role: "Head of Department",
          organisation: "Earlier School",
          email: "colleague@example.com",
          phone: "",
          relationship: "Worked together for six years",
          isCurrentEmployer: false,
        },
      ],
    },
    declaration: {
      safeguarding: true,
      convictions: "NONE",
      convictionsDetail: "",
      pendingAction: "NONE",
      pendingActionDetail: "",
      consent: true,
      truthful: true,
    },
  };
}
