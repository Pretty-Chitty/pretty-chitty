import Color from "color";

export class GameTheme {
  public backgroundColor = "#0f0119";

  public spacing = 8;
  public bottomBarHeight = 80;
  public topBarHeight = 40;
  public barColor = "#1c092c";
  public barGradientPercent = 0.05;
  public barGradientAngle = 110;

  public backgroundGradientPercent = 0.2;
  public backgroundGradientAngle = 150;

  public actionBarColor = "#3a1957";
  public actionBarAnimationDuration = 0.3;
  public actionBarContextColor = "#3a1957";
  public actionBarContextAnimationDuration = 0.3;
  public actionBarContextShadow = "rgba(0,0,0,0.2)";

  public barTextColor = "rgba(255,255,255,0.6)";
  public barTextHighlightColor = "rgba(255,255,255,0.6)";
  public barBreak = "rgba(255,255,255,0.3)";
  public barActiveTextColor = "rgba(255,255,255,0.9)";
  public barHighlightTextColor = "#66d5c1";
  public barDisabledTextColor = "rgba(255,255,255,0.2)";
  public panelSlotColor = "#858b99";
  public panelSlotSelectedColor = "#66d5c1";
  public fullResetColor = "#66d5c1";
  public barTopDropdownColor = "#1c092c";
  public barTopLineColor = "rgba(255,255,255,0.1)";

  public endGameBackgroundColor = "#1c092c";
  public endGameTextColor = "rgba(255,255,255,1)";

  public chitHighlightColor = "#66d5c1";
  public chitOutlineWidth = 0.1;
  public chitOutlineDownsample = 4;
  public chitOutlineStrength = 0.75;

  public panelSelectionCutoutBackground = "#ffffff";
  public panelSelectionCutoutSelected = "#66d5c1";

  public dialogBackgroundColor = "rgba(0,0,0,0.5)";
  public dialogForegroundColor = "#ffffff";
  public dialogFontSize = 14;

  public sparkForegroundColor = "#222";
  public sparkDuration = 200;
  public sparkBorderWidth = 4;
  public sparkPadding = 2;
  public sparkBorderColor = "rgba(0,0,0,0.3)";
  public sparkFlashColor = "#0ff";
  public sparkSize = 20;
  public sparkFontSize = 12;
  public topBarDropShadowColor = "rgba(0,0,0,0.7)";
  public topBarPlayerDropShadowColor = "rgba(0,0,0,0.2)";

  public galleryItemWidth = 150;
  public galleryItemHeight: number | undefined;
  public galleryItemSpacing = 20;

  public gallerySummaryBackgroundColor = "#000000";
  public gallerySummaryBackgroundOpacity = 0.7;
  public galleryBlur = 5;

  public actionLogBackgroundColor = "rgba(255,255,255,0.05)";
  public actionLogTextColor = "#ffffff";
  public actionBarWidth = 600;

  static withDefaults(primaryColor: string, highlight: string, textColor: string = "#ffffff") {
    const result = new GameTheme();
    result.chitHighlightColor = highlight;
    result.backgroundColor = Color(primaryColor).darken(0.5).hex();
    result.barColor = primaryColor;
    result.actionBarColor = Color(primaryColor).mix(Color(highlight), 0.4).hex();
    result.actionBarContextColor = primaryColor;
    result.fullResetColor = highlight;
    result.barHighlightTextColor = highlight;
    result.barTopDropdownColor = Color(primaryColor).mix(Color(highlight), 0.1).alpha(0.9).hexa();
    result.barTextHighlightColor = highlight;

    result.endGameBackgroundColor = result.barTopDropdownColor;

    result.barTextColor = Color(textColor).alpha(0.9).hexa();
    result.barTextHighlightColor = Color(textColor).mix(Color(highlight), 0.5).alpha(0.9).hexa();
    result.barBreak = Color(textColor).alpha(0.3).hexa();
    result.barActiveTextColor = Color(textColor).alpha(0.9).hexa();
    result.barTopLineColor = Color(textColor).alpha(0.1).hexa();
    result.endGameTextColor = Color(textColor).alpha(1).hexa();

    result.barDisabledTextColor = Color(result.barColor).isLight()
      ? Color(result.barColor).darken(1).hexa()
      : Color(result.barColor).lighten(1).hexa();

    result.actionLogTextColor = result.barActiveTextColor;

    return result;
  }

  layoutSize(width: number): "large" | "medium" | "mobile" {
    return width >= this.actionBarWidth * 2 ? "large" : width >= this.actionBarWidth * 1.3 ? "medium" : "mobile";
  }
}
