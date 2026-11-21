// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=9-10
// component=MenuCard

import figma from "figma"

const title = figma.selectedInstance.getString("Title")

export default {
  id: "menu-card",
  imports: [
    "import { BookOpen } from 'lucide-react';",
    "import { MenuCard } from 'src/components';",
  ],
  example: figma.code`<MenuCard${figma.helpers.react.renderProp(
    "title",
    title,
  )} tone="blue" icon={<BookOpen size={44}/>} onClick={() => { }}/>`,
  metadata: { nestable: true },
}
