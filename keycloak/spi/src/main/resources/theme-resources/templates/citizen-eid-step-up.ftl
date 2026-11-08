<#--
  EID step-up (EidStepUpAuthenticator). Shown when a portal needs High assurance
  and the SSO session was established with another ID. The user is already known;
  they confirm with their EID. The POC uses the account password in place of the
  EID card PIN.
-->
<#import "template.ftl" as layout>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true displayInfo=true; section>
<#if section = "header">
    ${msg("c360EidStepUpTitle")}
<#elseif section = "form">
    <style>
      /* The stock template shows the known username here, which is the CID: meaningless to a citizen. */
      .pf-v5-c-form__group:has(#kc-attempted-username) { display: none; }
      .c360-lede { margin: 0 0 1rem; }
      .c360-badge { display: inline-block; padding: .1rem .55rem; border-radius: 999px; background: #faefd2; color: #855d00;
                    font-weight: 600; font-size: .8rem; margin-bottom: .6rem; }
    </style>
    <span class="c360-badge">${msg("c360HighAssurance")}</span>
    <p class="c360-lede">${msg("c360EidStepUpIntro", c360Portal)}</p>
    <form id="kc-eid-step-up" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
        <div class="${properties.kcFormGroupClass!}">
            <div class="${properties.kcFormGroupLabelClass!}">
                <label for="identifier" class="${properties.kcFormLabelClass!}">
                    <span class="${properties.kcFormLabelTextClass!}">${msg("c360EidLabel")}</span>
                </label>
            </div>
            <span class="${properties.kcInputClass!}">
                <input id="identifier" name="identifier" type="text" value="${c360Identifier}" autofocus
                       autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="EID00000000"/>
            </span>
        </div>
        <div class="${properties.kcFormGroupClass!}">
            <div class="${properties.kcFormGroupLabelClass!}">
                <label for="password" class="${properties.kcFormLabelClass!}">
                    <span class="${properties.kcFormLabelTextClass!}">${msg("c360EidSecret")}</span>
                </label>
            </div>
            <span class="${properties.kcInputClass!}">
                <input id="password" name="password" type="password" autocomplete="current-password"/>
            </span>
        </div>
        <@buttons.actionGroup>
            <@buttons.button id="kc-login" name="login" label="c360ConfirmEid" class=["kcButtonPrimaryClass", "kcButtonBlockClass"] />
            <@buttons.button id="kc-cancel" name="cancel" label="doCancel" class=["kcButtonSecondaryClass", "kcButtonBlockClass"] />
        </@buttons.actionGroup>
    </form>
<#elseif section = "info">
    <span>${msg("c360EidPinNote")}</span>
</#if>
</@layout.registrationLayout>
