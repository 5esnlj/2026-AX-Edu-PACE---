// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=9-8
// component=Button

import figma from "figma"

const label = figma.selectedInstance.getString("Label")

export default {
  id: "button-secondary",
  imports: ["import { Button } from 'src/components';"],
  example: figma.code`<Button variant="secondary">${figma.helpers.react.renderChildren(
    label,
  )}</Button>`,
  metadata: { nestable: true },
}
