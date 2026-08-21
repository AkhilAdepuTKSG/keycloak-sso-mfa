<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
    <#if section = "header">
        ${msg("smsLinkUsernameTitle")}
    <#elseif section = "form">
        <form id="kc-sms-link-form" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}">
                <label for="username" class="${properties.kcLabelClass!}">${msg("smsLinkUsernameLabel")}</label>
                <input tabindex="1" id="username" name="username" type="text" autofocus autocomplete="username"
                       class="${properties.kcInputClass!}" aria-invalid="<#if messagesPerField.existsError('username')>true</#if>"/>
                <#if messagesPerField.existsError('username')>
                    <span class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('username'))?no_esc}
                    </span>
                </#if>
            </div>
            <div class="${properties.kcFormGroupClass!}">
                <input tabindex="2" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}"
                       type="submit" value="${msg("smsLinkUsernameSubmit")}"/>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
