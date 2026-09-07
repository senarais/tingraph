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

export const TEMPLATES: Record<DiagramCategory, string> = {
  flow: FLOWCHART_TEMPLATE,
  bpmn: BPMN_TEMPLATE,
};

export const TEMPLATE_LABELS: Record<DiagramCategory, string> = {
  flow: "Flowchart",
  bpmn: "BPMN 2.0",
};
