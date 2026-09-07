export interface RawPath {
  d: string;
  height?: number;
  width?: number;
  heightElements?: number[];
  widthElements?: number[];
}

// Ported 1:1 from bpmn-js upstream lib/draw/PathMap.js (MIT licensed).
// Generated programmatically from the upstream module — never hand-edit;
// regenerate with scripts/gen-bpmn-paths.mjs if bpmn-js changes.
export const RAW_PATHS: Record<string, RawPath> = {
  EVENT_MESSAGE: {
    d:
      "m {mx},{my} l 0,{e.y1} l {e.x1},0 l 0,-{e.y1} z l {e.x0},{e.y0} l {e.x0},-{e.y0}",
    height: 36,
    width: 36,
    heightElements: [6,14],
    widthElements: [10.5,21],
  },
  EVENT_TIMER_WH: {
    d:
      "M {mx},{my} l {e.x0},-{e.y0} m -{e.x0},{e.y0} l {e.x1},{e.y1} ",
    height: 36,
    width: 36,
    heightElements: [10,2],
    widthElements: [3,7],
  },
  EVENT_TIMER_LINE: {
    d:
      "M {mx},{my} m {e.x0},{e.y0} l -{e.x1},{e.y1} ",
    height: 36,
    width: 36,
    heightElements: [10,3],
    widthElements: [0,0],
  },
  GATEWAY_EXCLUSIVE: {
    d:
      "m {mx},{my} {e.x0},{e.y0} {e.x1},{e.y0} {e.x2},0 {e.x4},{e.y2} {e.x4},{e.y1} {e.x2},0 {e.x1},{e.y3} {e.x0},{e.y3} {e.x3},0 {e.x5},{e.y1} {e.x5},{e.y2} {e.x3},0 z",
    height: 17.5,
    width: 17.5,
    heightElements: [8.5,6.5312,-6.5312,-8.5],
    widthElements: [6.5,-6.5,3,-3,5,-5],
  },
  GATEWAY_PARALLEL: {
    d:
      "m {mx},{my} 0,{e.y1} -{e.x1},0 0,{e.y0} {e.x1},0 0,{e.y1} {e.x0},0 0,-{e.y1} {e.x1},0 0,-{e.y0} -{e.x1},0 0,-{e.y1} -{e.x0},0 z",
    height: 30,
    width: 30,
    heightElements: [5,12.5],
    widthElements: [5,12.5],
  },
  TASK_TYPE_SEND: {
    d:
      "m {mx},{my} l 0,{e.y1} l {e.x1},0 l 0,-{e.y1} z l {e.x0},{e.y0} l {e.x0},-{e.y0}",
    height: 14,
    width: 21,
    heightElements: [6,14],
    widthElements: [10.5,21],
  },
  TASK_TYPE_SCRIPT: {
    d:
      "m {mx},{my} c 9.966553,-6.27276 -8.000926,-7.91932 2.968968,-14.938 l -8.802728,0 c -10.969894,7.01868 6.997585,8.66524 -2.968967,14.938 z m -7,-12 l 5,0 m -4.5,3 l 4.5,0 m -3,3 l 5,0m -4,3 l 5,0",
    height: 15,
    width: 12.6,
    heightElements: [6,14],
    widthElements: [10.5,21],
  },
  TASK_TYPE_USER_1: {
    d:
      "m {mx},{my} c 0.909,-0.845 1.594,-2.049 1.594,-3.385 0,-2.554 -1.805,-4.62199999 -4.357,-4.62199999 -2.55199998,0 -4.28799998,2.06799999 -4.28799998,4.62199999 0,1.348 0.974,2.562 1.89599998,3.405 -0.52899998,0.187 -5.669,2.097 -5.794,4.7560005 v 6.718 h 17 v -6.718 c 0,-2.2980005 -5.5279996,-4.5950005 -6.0509996,-4.7760005 zm -8,6 l 0,5.5 m 11,0 l 0,-5",
  },
  TASK_TYPE_USER_2: {
    d:
      "m {mx},{my} m 2.162,1.009 c 0,2.4470005 -2.158,4.4310005 -4.821,4.4310005 -2.66499998,0 -4.822,-1.981 -4.822,-4.4310005 ",
  },
  TASK_TYPE_USER_3: {
    d:
      "m {mx},{my} m -6.9,-3.80 c 0,0 2.25099998,-2.358 4.27399998,-1.177 2.024,1.181 4.221,1.537 4.124,0.965 -0.098,-0.57 -0.117,-3.79099999 -4.191,-4.13599999 -3.57499998,0.001 -4.20799998,3.36699999 -4.20699998,4.34799999 z",
  },
  DATA_OBJECT_PATH: {
    d:
      "m 0,0 {e.x1},0 {e.x0},{e.y0} 0,{e.y1} -{e.x2},0 0,-{e.y2} {e.x1},0 0,{e.y0} {e.x0},0",
    height: 61,
    width: 51,
    heightElements: [10,50,60],
    widthElements: [10,40,50,60],
  },
};
