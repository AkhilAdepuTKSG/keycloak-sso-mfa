<#--
  "Link or enrol your EID" (EidStepUpAuthenticator). Shown instead of an error
  when a portal needs High assurance and the person has no EID in Citizen 360.
-->
<#import "template.ftl" as layout>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true displayInfo=false; section>
<#if section = "header">
    ${msg("c360EnrolTitle")}
<#elseif section = "form">
    <style>
      /* The stock template shows the known username here, which is the CID: meaningless to a citizen. */
      .pf-v5-c-form__group:has(#kc-attempted-username) { display: none; }
      .c360-badge { display: inline-block; padding: .1rem .55rem; border-radius: 999px; background: #faefd2; color: #855d00;
                    font-weight: 600; font-size: .8rem; margin-bottom: .6rem; }
      .c360-options { display: grid; gap: .75rem; margin: 1rem 0 1.25rem; }
      .c360-option { border: 1px solid #d2d2d2; border-radius: 8px; padding: .8rem 1rem; }
      .c360-option h2 { font-size: 1rem; font-weight: 600; margin: 0 0 .3rem; }
      .c360-option p { margin: 0; font-size: .9rem; }
    </style>
    <span class="c360-badge">${msg("c360HighAssurance")}</span>
    <p id="c360-enrol-intro">${msg("c360EnrolIntro", c360Portal)}</p>
    <div class="c360-options">
        <div class="c360-option">
            <h2>${msg("c360EnrolLinkTitle")}</h2>
            <p>${msg("c360EnrolLinkBody")}</p>
        </div>
        <div class="c360-option">
            <h2>${msg("c360EnrolNewTitle")}</h2>
            <p>${msg("c360EnrolNewBody")}</p>
        </div>
    </div>
    <form id="kc-eid-enrol" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
        <@buttons.actionGroup>
            <a id="c360-home" class="${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!}" href="${c360HomeUrl}">${msg("c360BackHome")}</a>
            <@buttons.button id="kc-cancel" name="cancel" label="c360BackToPortal" class=["kcButtonSecondaryClass", "kcButtonBlockClass"] />
        </@buttons.actionGroup>
    </form>
</#if>
</@layout.registrationLayout>
