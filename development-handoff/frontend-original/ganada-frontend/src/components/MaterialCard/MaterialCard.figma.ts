// url=https://www.figma.com/design/WQfQ1Uoaa0E013X51QSavH/ganada?node-id=29-1308
// component=MaterialCard

import figma from "figma"

const unit = figma.selectedInstance.getString("Unit")
const pageTitle = figma.selectedInstance.getString("PageTitle")
const name = figma.selectedInstance.getString("Name")
const date = figma.selectedInstance.getString("Date")

export default {
  id: "material-card",
  imports: ["import { MaterialCard } from 'src/components';"],
  example: figma.code`<MaterialCard subject="사회"${figma.helpers.react.renderProp(
    "unit",
    unit,
  )}${figma.helpers.react.renderProp(
    "pageTitle",
    pageTitle,
  )}${figma.helpers.react.renderProp(
    "name",
    name,
  )}${figma.helpers.react.renderProp("date", date)} onClick={() => { }}/>`,
  metadata: { nestable: true },
}
