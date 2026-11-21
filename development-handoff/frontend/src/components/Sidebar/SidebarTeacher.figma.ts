// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=23-380
// component=Sidebar

import figma from "figma"

export default {
  id: "sidebar-teacher",
  imports: ["import { Sidebar } from 'src/components';"],
  example: figma.code`<Sidebar role="teacher" className="3학년 2반" active="dashboard" onNavigate={() => { }}/>`,
}
