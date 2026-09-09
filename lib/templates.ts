import { DiagramCategory } from "@/lib/types";

export const FLOWCHART_TEMPLATE = `flow "Chart Title" {
  start S1 "Start Process"
  io I1 "Read Input Data"
  process P1 "Execute Algorithm"
  decision D1 "Is Valid?"
  end E1 "Finish"

  S1 -> I1 -> P1 -> D1
  D1 [Yes] -> E1
  D1 [No] -> P1
}
`;

export const BPMN_TEMPLATE = `bpmn "Vacation Request" {
  pool P1 "Request" {
    lane L1 "Employee" {
      start S1 "Submit request"
      task A1 "Fill vacation form"
      send-task A2 "Send to manager"
    }
    lane L2 "Manager" {
      gw-ex G1 "Approved?"
      end E1 "Done"
    }
    lane L3 "HR" {
      send-task A3 "Record leave"
      data D1 "Request log"
      end E2 "Archived"
    }
  }

  S1 -> A1 -> A2 -> G1
  G1 [Yes] -> A3 -> E2
  G1 [No] -> E1
  A3 -.-> D1
}
`;

export const ORG_TEMPLATE = `org "BAGAN STRUKTUR ORGANISASI FAKULTAS PSIKOLOGI UNIVERSITAS NEGERI JAKARTA" {
  role DEKAN "DEKAN" "Dr. Gumgum Gumelar F. R, M.Si"
  role SENAT "SENAT FAKULTAS"

  role WD1 "WAKIL DEKAN I" "Mira Ariyani, Ph.D"
  role WD2 "WAKIL DEKAN II" "Dr. Lussy Dwiutami W., M.Pd"
  role WD3 "WAKIL DEKAN III" "Herdiyan Maulana, Ph.D"

  role LAB "KEPALA LAB" {
    unit "Lab. Psikodiagnostik" "Ernita Zakiah, M.Psi"
    unit "Lab. Komputer" "Fildzah Rudyah P. M.Si"
    unit "Lab. Eksperimen & Multimedia" "Adhissa Qonita, M.Psi. Psikolog"
  }
  role S1 "KOORPRODI SARJANA (S1)" "Irma Rosalinda, M.Si. Psikolog"
  role S2 "KOORPRODI MAGISTER SAINS (S2)" "Dr. Anna Armeini Rangkuti, M.Si"
  role GPJM "KETUA GPJM" "Gita Irianda Rizkyani M., M.Psi. Psikolog"

  role LAYANAN "KOORDINATOR LAYANAN" "Aris Parmono, S.AP, M.AP"
  role TPJM1 "TPJM PRODI S1" "Ernawati, M.Psi.Psikolog"
  role TPJM2 "TPJM PRODI S2" "Liza Yudhita Widyastuti, M.Psi. Psikolog"

  DEKAN -> WD1
  DEKAN -> WD2
  DEKAN -> WD3
  DEKAN -> LAB
  DEKAN -> S1
  DEKAN -> S2
  DEKAN -> GPJM
  S1 -> LAYANAN
  GPJM -> TPJM1
  GPJM -> TPJM2
  DEKAN -.-> SENAT
}
`;

export const TEMPLATES: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
  org: ORG_TEMPLATE,
};

export const TEMPLATE_LABELS: Record<DiagramCategory, string> = {
  flow: "Flowchart",
  bpmn: "BPMN 2.0",
  org: "Org chart",
};
